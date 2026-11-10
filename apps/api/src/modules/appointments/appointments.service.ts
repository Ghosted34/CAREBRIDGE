import type { z } from 'zod';
import { pool, withTransaction, type Db } from '../../db/pool.js';
import { assertCanActForProvider, isPlatformStaff, memberProviderIds } from '../../lib/access.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import { assertTransition } from '../../lib/stateMachine.js';
import type { Pagination } from '../../lib/validate.js';
import * as notifications from '../notifications/notifications.service.js';
import * as providersRepo from '../providers/providers.repo.js';
import * as requestsRepo from '../requests/requests.repo.js';
import * as slotsRepo from '../slots/slots.repo.js';
import type { BookAppointmentBody } from './appointments.schema.js';
import * as repo from './appointments.repo.js';

const BOOKABLE_REQUEST_STATUSES = [
  'provider_accepted',
  'assessment',
  'treatment_planned',
  'in_progress',
];
const MAX_DURATION_MS = 8 * 60 * 60 * 1000;

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
 * Book with the provider assigned to the request. Bookings for one provider are
 * serialised by locking the provider row, so two concurrent bookings cannot both
 * pass the overlap check.
 */
export async function book(c: Ctx, input: z.infer<typeof BookAppointmentBody>) {
  // DATETIME columns round fractional seconds, so truncate first: what we compare is what we store.
  const toSecond = (iso: string) => new Date(Math.floor(new Date(iso).getTime() / 1000) * 1000);
  const start = toSecond(input.starts_at);
  const end = toSecond(input.ends_at);
  if (end <= start) throw AppError.badRequest('ends_at must be after starts_at');
  if (end.getTime() - start.getTime() > MAX_DURATION_MS)
    throw AppError.badRequest('Appointments cannot exceed 8 hours');
  if (start.getTime() <= Date.now()) throw AppError.badRequest('starts_at must be in the future');

  return withTransaction(async (tx) => {
    const request = await requestsRepo.findById(tx, input.care_request_id, { forUpdate: true });
    if (!request) throw AppError.notFound('Care request');
    if (c.user.role === 'patient' && request.patient_user_id !== c.user.id)
      throw AppError.notFound('Care request');
    if (!request.assigned_provider_id || !BOOKABLE_REQUEST_STATUSES.includes(request.status)) {
      throw AppError.conflict(
        'REQUEST_NOT_BOOKABLE',
        'A provider must accept this request before booking',
      );
    }
    const providerId: number = request.assigned_provider_id;
    if (c.user.role !== 'patient') await assertCanActForProvider(tx, c.user, providerId);

    // The visit happens at one of the provider's operating centres.
    const centre = await providersRepo.findCentre(tx, input.centre_id);
    if (!centre || centre.provider_id !== providerId) {
      throw AppError.notFound('Operating centre');
    }

    // A specific caregiver must be an active caregiver of that centre.
    if (input.caregiver_user_id) {
      const caregiver = await providersRepo.findActiveCentreCaregiver(
        tx,
        input.centre_id,
        input.caregiver_user_id,
      );
      if (!caregiver) {
        throw AppError.notFound('Caregiver');
      }
    }

    // Serialise bookings per provider.
    await tx.execute('SELECT id FROM providers WHERE id = ? FOR UPDATE', [providerId]);
    if ((await repo.findOverlapping(tx, providerId, start, end)).length) {
      throw AppError.conflict('SLOT_UNAVAILABLE', 'Provider slot is no longer available');
    }
    if (input.slot_id) {
      const slot = await slotsRepo.findSlotById(tx, input.slot_id, { forUpdate: true });
      if (
        !slot ||
        slot.provider_id !== providerId ||
        slot.centre_id !== input.centre_id ||
        slot.status !== 'available'
      ) {
        throw AppError.conflict('SLOT_UNAVAILABLE', 'Selected slot is no longer available');
      }
    }
    const id = await repo.insert(tx, {
      care_request_id: request.id,
      patient_user_id: request.patient_user_id,
      provider_id: providerId,
      centre_id: input.centre_id,
      caregiver_user_id: input.caregiver_user_id ?? null,
      appointment_type: input.appointment_type,
      appointment_mode: input.appointment_mode,
      starts_at: start,
      ends_at: end,
      created_by_user_id: c.user.id,
    });
    if (input.slot_id) {
      await slotsRepo.updateSlotStatus(tx, input.slot_id, 'booked', id);
    }
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'APPOINTMENT_BOOKED',
      entityType: 'appointment',
      entityId: id,
      ip: c.ip,
      metadata: { care_request_id: request.id, provider_id: providerId },
    });
    // Tell the other side: the clinic when the patient booked, the patient when staff booked.
    const notice = {
      request_id: request.id,
      appointment_id: id,
      provider: await notifications.providerName(tx, providerId),
      starts_at: start.toISOString(),
    };
    if (c.user.role === 'patient') {
      const staff = await notifications.providerStaffIds(tx, providerId, [
        'owner',
        'clinician',
        'scheduler',
        'receptionist',
      ]);
      await notifications.notify(tx, staff, 'appointment_booked_provider', notice);
    } else {
      await notifications.notify(
        tx,
        [request.patient_user_id],
        'appointment_booked_patient',
        notice,
      );
    }
    return { id, provider_id: providerId, status: 'booked' };
  });
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

type ApptStatus = 'confirmed' | 'cancelled' | 'checked_in' | 'completed' | 'no_show';

async function changeStatus(c: Ctx, id: number, to: ApptStatus, action: string) {
  return withTransaction(async (tx) => {
    const appt = await repo.findById(tx, id, { forUpdate: true });
    if (!appt) throw AppError.notFound('Appointment');
    const isOwnPatient = c.user.role === 'patient' && appt.patient_user_id === c.user.id;
    // Patients may cancel their own appointments; every other change is a provider action.
    if (!(isOwnPatient && to === 'cancelled')) {
      if (c.user.role === 'patient') throw AppError.notFound('Appointment');
      await assertCanActForProvider(tx, c.user, appt.provider_id);
    }
    assertTransition('appointment', appt.status, to);
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
  confirm: { to: 'confirmed', action: 'APPOINTMENT_CONFIRMED' },
  'check-in': { to: 'checked_in', action: 'APPOINTMENT_CHECKED_IN' },
  complete: { to: 'completed', action: 'APPOINTMENT_COMPLETED' },
  'no-show': { to: 'no_show', action: 'APPOINTMENT_NO_SHOW' },
} as const;
export type ProviderAction = keyof typeof PROVIDER_ACTIONS;

export const providerAction = (c: Ctx, id: number, verb: ProviderAction) =>
  changeStatus(c, id, PROVIDER_ACTIONS[verb].to, PROVIDER_ACTIONS[verb].action);
export const cancel = (c: Ctx, id: number) =>
  changeStatus(c, id, 'cancelled', 'APPOINTMENT_CANCELLED');
