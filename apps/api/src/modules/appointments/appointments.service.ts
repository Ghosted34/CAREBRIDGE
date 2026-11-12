import type { z } from 'zod';
import { pool, withTransaction, type Db } from '../../db/pool.js';
import { assertCanActForProvider, isPlatformStaff, memberProviderIds } from '../../lib/access.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import { assertTransition } from '../../lib/stateMachine.js';
import type { Pagination } from '../../lib/validate.js';
import * as notifications from '../notifications/notifications.service.js';
import * as requestsRepo from '../requests/requests.repo.js';
import * as availabilityRepo from '../availability/availability.repo.js';
import * as availability from '../availability/availability.service.js';
import { problemByKey } from '../availability/problems.js';
import { assertConsents } from '../consents/consents.service.js';
import { EMERGENCY_GUIDANCE } from '../requests/emergency.js';
import { lagosParts } from '../../lib/lagosTime.js';
import type { BookAppointmentBody } from './appointments.schema.js';
import * as repo from './appointments.repo.js';

/**
 * Clinical governance (post-visit only): cost estimates, specialist referrals and treatment
 * planning may only happen once the patient has been seen for this care request — at least one
 * appointment `checked_in` or `completed`. Called inside the caller's transaction.
 */
export async function assertVisitHappened(db: Db, careRequestId: number): Promise<void> {
  if ((await repo.countSeenForRequest(db, careRequestId)) === 0) {
    throw AppError.conflict(
      'VISIT_REQUIRED',
      'The patient must be seen (an appointment checked in or completed) before this step',
    );
  }
}

/**
 * A booking request at a centre. The time must be free right now: inside the centre's opening hours
 * (Lagos time), on its slot grid, and not overlapping another active appointment AT THAT CENTRE
 * (capacity: one at a time per centre). The centre row is locked so two requests for the same time
 * can't both pass. The appointment starts `requested`; the clinic confirms or declines.
 */
export async function book(c: Ctx, input: z.infer<typeof BookAppointmentBody>, now = new Date()) {
  // DATETIME columns round fractional seconds, so truncate first: what we compare is what we store.
  const start = new Date(Math.floor(new Date(input.starts_at).getTime() / 1000) * 1000);
  if (start.getTime() <= now.getTime())
    throw AppError.badRequest('starts_at must be in the future');
  if (c.user.role !== 'patient' && c.user.role !== 'provider_staff') throw AppError.forbidden();
  if (c.user.role === 'provider_staff' && !input.care_request_id) {
    throw AppError.badRequest(
      'Clinic staff can book follow-ups on an existing visit (care_request_id)',
    );
  }
  if (input.has_emergency_symptoms) {
    await audit(pool, {
      actorUserId: c.user.id,
      action: 'CARE_REQUEST_EMERGENCY_REDIRECTED',
      entityType: 'user',
      entityId: c.user.id,
      ip: c.ip,
    });
    throw new AppError(422, 'EMERGENCY_REDIRECT', EMERGENCY_GUIDANCE);
  }
  // Sharing a booking with a clinic needs current terms, privacy and data-sharing consent.
  if (c.user.role === 'patient') await assertConsents(pool, c.user.id);

  return withTransaction(async (tx) => {
    const centre = await availabilityRepo.findBookableCentre(tx, input.centre_id, {
      forUpdate: true,
    });
    if (
      !centre ||
      !centre.is_active ||
      centre.verification_status !== 'verified' ||
      centre.provider_status !== 'active'
    ) {
      throw AppError.notFound('Centre');
    }
    const providerId = centre.provider_id as number;

    // Which visit (care request) this belongs to.
    let requestId: number;
    let patientId: number;
    let isFollowUp = false;
    if (input.care_request_id) {
      const request = await requestsRepo.findById(tx, input.care_request_id, { forUpdate: true });
      const allowed =
        request &&
        (c.user.role === 'patient'
          ? request.patient_user_id === c.user.id
          : await isMember(tx, c, request.assigned_provider_id));
      if (!request || !allowed) throw AppError.notFound('Care request');
      if (['completed', 'cancelled'].includes(request.status)) {
        throw AppError.conflict('REQUEST_CLOSED', 'This visit is closed; start a new booking');
      }
      if (request.assigned_provider_id !== providerId) {
        throw AppError.conflict('OTHER_PROVIDER', 'Follow-ups are booked with the same clinic');
      }
      requestId = request.id;
      patientId = request.patient_user_id;
      isFollowUp = true;
    } else {
      const problem = problemByKey(input.problem!);
      // mysql2 returns JSON columns parsed; tolerate a string just in case (e.g. MariaDB returns text).
      const specialties = (
        typeof centre.specialties === 'string'
          ? JSON.parse(centre.specialties)
          : (centre.specialties ?? [])
      ) as string[];
      const specialty = problem.specialties.find((s) => specialties.includes(s));
      if (!specialty) {
        throw AppError.conflict(
          'NOT_A_MATCH',
          `${centre.provider_name} does not treat this problem`,
        );
      }
      patientId = c.user.id;
      requestId = await requestsRepo.insert(tx, {
        patient_user_id: patientId,
        specialty,
        service_type: problem.label,
        description: input.details || problem.label,
        preferred_city: centre.city,
        urgency: 'routine',
      });
      assertTransition('care_request', 'submitted', 'provider_accepted');
      await requestsRepo.setStatus(tx, requestId, 'provider_accepted', providerId);
      await audit(tx, {
        actorUserId: c.user.id,
        action: 'CARE_REQUEST_CREATED',
        entityType: 'care_request',
        entityId: requestId,
        ip: c.ip,
        metadata: { provider_id: providerId, problem: problem.key },
      });
    }

    if (input.caregiver_id) {
      const ok = await repo.caregiverAtCentre(tx, input.caregiver_id, input.centre_id);
      if (!ok) throw AppError.notFound('Caregiver');
    }

    // Is that exact time still free at this centre (checked under the centre lock)?
    const { date } = lagosParts(start);
    const windows = [{ from_date: date, to_date: date, start_minute: 0, end_minute: 24 * 60 }];
    const free =
      (await availability.freeTimesFor(tx, [input.centre_id], windows, now)).get(input.centre_id) ??
      [];
    const slot = free.find((f) => f.start.getTime() === start.getTime());
    if (!slot) {
      throw AppError.conflict(
        'SLOT_UNAVAILABLE',
        'That time is not available at this centre — pick another',
      );
    }

    // A patient's booking waits for the clinic; one the clinic books itself is already confirmed.
    const status = c.user.role === 'patient' ? 'requested' : 'confirmed';
    const id = await repo.insert(tx, {
      care_request_id: requestId,
      patient_user_id: patientId,
      provider_id: providerId,
      centre_id: input.centre_id,
      caregiver_id: input.caregiver_id ?? null,
      appointment_type: isFollowUp ? 'follow_up' : 'assessment',
      appointment_mode: input.appointment_mode,
      starts_at: slot.start,
      ends_at: slot.end,
      status,
      created_by_user_id: c.user.id,
    });
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'APPOINTMENT_REQUESTED',
      entityType: 'appointment',
      entityId: id,
      ip: c.ip,
      metadata: {
        care_request_id: requestId,
        provider_id: providerId,
        centre_id: input.centre_id,
        appointment_mode: input.appointment_mode,
        status,
      },
    });
    const notice = {
      request_id: requestId,
      appointment_id: id,
      provider: centre.provider_name as string,
      starts_at: slot.start.toISOString(),
    };
    if (c.user.role === 'patient') {
      // The clinic confirms or declines.
      const staff = await notifications.providerStaffIds(tx, providerId, [
        'owner',
        'clinician',
        'scheduler',
        'receptionist',
      ]);
      await notifications.notify(tx, staff, 'appointment_booked_provider', notice);
    } else {
      await notifications.notify(tx, [patientId], 'appointment_booked_patient', notice);
    }
    return {
      id,
      care_request_id: requestId,
      provider_id: providerId,
      centre_id: input.centre_id,
      starts_at: slot.start.toISOString(),
      ends_at: slot.end.toISOString(),
      status,
    };
  });
}

async function isMember(db: Db, c: Ctx, providerId: number | null): Promise<boolean> {
  if (!providerId) return false;
  return (await memberProviderIds(db, c.user.id)).includes(providerId);
}

export async function listMine(c: Ctx, page: Pagination, providerId?: number) {
  if (c.user.role === 'patient') return repo.list(pool, { ...page, patientId: c.user.id });
  if (isPlatformStaff(c.user)) return repo.list(pool, { ...page, providerId });
  // Staff may only narrow the list to a clinic they actually belong to.
  const mine = await memberProviderIds(pool, c.user.id);
  if (providerId !== undefined) {
    if (!mine.includes(providerId)) throw AppError.forbidden();
    return repo.list(pool, { ...page, providerId });
  }
  return repo.list(pool, { ...page, providerIds: mine });
}

type ApptStatus =
  'requested' | 'booked' | 'confirmed' | 'cancelled' | 'checked_in' | 'completed' | 'no_show';

async function changeStatus(
  c: Ctx,
  id: number,
  to: ApptStatus,
  action: string,
): Promise<{ id: number; status: ApptStatus }> {
  return withTransaction(async (tx) => {
    const appt = await repo.findById(tx, id, { forUpdate: true });
    if (!appt) throw AppError.notFound('Appointment');
    const isOwnPatient = c.user.role === 'patient' && appt.patient_user_id === c.user.id;
    // Patients may cancel their own appointments; every other change is a provider action.
    if (!(isOwnPatient && to === 'cancelled')) {
      if (c.user.role === 'patient') throw AppError.notFound('Appointment');
      await assertCanActForProvider(tx, c.user, appt.provider_id);
    }
    assertTransition('appointment', appt.status as string, to);
    await repo.setStatus(tx, id, to);

    await audit(tx, {
      actorUserId: c.user.id,
      action,
      entityType: 'appointment',
      entityId: id,
      ip: c.ip,
    });
    const notice = {
      request_id: appt.care_request_id as number,
      appointment_id: id,
      provider: appt.provider as string,
      starts_at: new Date(appt.starts_at).toISOString(),
    };
    if (to === 'confirmed') {
      await notifications.notify(tx, [appt.patient_user_id], 'appointment_confirmed', notice);
    } else if (to === 'cancelled') {
      if (isOwnPatient) {
        const staff = await notifications.providerStaffIds(tx, appt.provider_id);
        await notifications.notify(tx, staff, 'appointment_cancelled_provider', notice);
      } else if (action === 'APPOINTMENT_DECLINED') {
        await notifications.notify(
          tx,
          [appt.patient_user_id],
          'appointment_declined_patient',
          notice,
        );
      } else {
        await notifications.notify(
          tx,
          [appt.patient_user_id],
          'appointment_cancelled_patient',
          notice,
        );
      }
    }
    return { id, status: to };
  });
}

/** Provider-side status actions, keyed by URL verb. */
export const PROVIDER_ACTIONS = {
  confirm: { to: 'confirmed' as const, action: 'APPOINTMENT_CONFIRMED' },
  decline: { to: 'cancelled' as const, action: 'APPOINTMENT_DECLINED' },
  'check-in': { to: 'checked_in' as const, action: 'APPOINTMENT_CHECKED_IN' },
  complete: { to: 'completed' as const, action: 'APPOINTMENT_COMPLETED' },
  'no-show': { to: 'no_show' as const, action: 'APPOINTMENT_NO_SHOW' },
} as const;
export type ProviderAction = keyof typeof PROVIDER_ACTIONS;

export const providerAction = (c: Ctx, id: number, verb: ProviderAction) =>
  changeStatus(c, id, PROVIDER_ACTIONS[verb].to, PROVIDER_ACTIONS[verb].action);
export const cancel = (c: Ctx, id: number) =>
  changeStatus(c, id, 'cancelled', 'APPOINTMENT_CANCELLED');
