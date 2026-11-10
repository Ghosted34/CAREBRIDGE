import type { z } from 'zod';
import { pool, withTransaction, type Row } from '../../db/pool.js';
import { assertCanActForProvider, isPlatformStaff, memberProviderIds } from '../../lib/access.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import { assertTransition } from '../../lib/stateMachine.js';
import type { Pagination } from '../../lib/validate.js';
import * as appointmentsRepo from '../appointments/appointments.repo.js';
import * as appointmentsService from '../appointments/appointments.service.js';
import { assertConsents } from '../consents/consents.service.js';
import type { AssignedQuery, CreateRequestBody, QueueQuery } from './requests.schema.js';
import * as notifications from '../notifications/notifications.service.js';
import * as repo from './requests.repo.js';

/**
 * Shown when a patient reports emergency symptoms. Routine matching is not appropriate.
 * TODO(clinical-governance): confirm wording and numbers before pilot launch.
 */
export const EMERGENCY_GUIDANCE =
  'Your symptoms may need emergency care. Please call 112 (or Lagos State emergency line 767) or go to the nearest emergency department now. CareBridge cannot handle emergencies.';

export async function create(c: Ctx, input: z.infer<typeof CreateRequestBody>) {
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
  // Sharing a request with providers needs current terms, privacy and data-sharing consent.
  await assertConsents(pool, c.user.id);
  const { target_provider_id: targetProviderId, ...request } = input;
  return withTransaction(async (tx) => {
    // A patient who chose a clinic in the directory is routed straight to it, if it can take them.
    let target: Row | undefined;
    if (targetProviderId !== undefined) {
      target = await repo.findDirectTarget(
        tx,
        targetProviderId,
        request.specialty,
        request.preferred_city,
      );
      if (!target) throw AppError.notFound('Provider');
    }
    const id = await repo.insert(tx, { ...request, patient_user_id: c.user.id });
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'CARE_REQUEST_CREATED',
      entityType: 'care_request',
      entityId: id,
      ip: c.ip,
    });
    if (target) {
      const targetId = target.id as number;
      // The patient has already chosen, so this skips the offer round (same transition an
      // accepted offer makes) and goes straight to the chosen clinic.
      assertTransition('care_request', 'submitted', 'provider_accepted');
      await repo.setStatus(tx, id, 'provider_accepted', targetId);
      await audit(tx, {
        actorUserId: c.user.id,
        action: 'CARE_REQUEST_ASSIGNED',
        entityType: 'care_request',
        entityId: id,
        ip: c.ip,
        metadata: { assigned_provider_id: targetId, directed: true, from: 'submitted' },
      });
      const staff = await notifications.providerStaffIds(tx, targetId, [
        'owner',
        'clinician',
        'scheduler',
      ]);
      await notifications.notify(tx, staff, 'request_directed', {
        request_id: id,
        provider: target.display_name as string,
      });
      return { id, status: 'provider_accepted' as const };
    }
    // Tell staff of every clinic whose queue this request appears in.
    for (const provider of await repo.matchingProviders(tx, id)) {
      const staff = await notifications.providerStaffIds(tx, provider.id, [
        'owner',
        'clinician',
        'scheduler',
      ]);
      await notifications.notify(tx, staff, 'new_request', {
        request_id: id,
        provider: provider.name,
      });
    }
    return { id, status: 'submitted' as const };
  });
}

export const listMine = (c: Ctx, page: Pagination) => repo.listForPatient(pool, c.user.id, page);

/**
 * Which clinics a list is scoped to. `null` means "everything" (platform staff only).
 * Staff may narrow to one clinic, but only one they belong to.
 */
async function scopeFor(c: Ctx, providerId?: number): Promise<number[] | null> {
  if (isPlatformStaff(c.user)) return null;
  const mine = await memberProviderIds(pool, c.user.id);
  if (providerId === undefined) return mine;
  if (!mine.includes(providerId)) throw AppError.forbidden('You are not a member of that clinic');
  return [providerId];
}

export async function queue(c: Ctx, q: z.infer<typeof QueueQuery>) {
  const providerIds = await scopeFor(c, q.provider_id);
  return repo.listQueue(pool, {
    ...q,
    providerIds,
    // Platform staff may also narrow the queue to one clinic.
    providerId: isPlatformStaff(c.user) ? q.provider_id : undefined,
  });
}

/**
 * Who may read a request: its patient, platform staff, and staff of a provider that
 * is assigned to it or has made an offer on it.
 */
export async function get(c: Ctx, id: number) {
  const request = await repo.findById(pool, id);
  if (!request) throw AppError.notFound('Care request');
  if (c.user.role === 'patient' && request.patient_user_id === c.user.id) return request;
  if (isPlatformStaff(c.user)) return request;
  if (c.user.role === 'provider_staff') {
    const mine = await memberProviderIds(pool, c.user.id);
    if (request.assigned_provider_id && mine.includes(request.assigned_provider_id)) return request;
  }
  throw AppError.notFound('Care request'); // 404, not 403: don't confirm the request exists
}

export async function cancel(c: Ctx, id: number) {
  return withTransaction(async (tx) => {
    const request = await repo.findById(tx, id, { forUpdate: true });
    const owns = request && c.user.role === 'patient' && request.patient_user_id === c.user.id;
    if (!request || !(owns || isPlatformStaff(c.user))) throw AppError.notFound('Care request');
    assertTransition('care_request', request.status, 'cancelled');
    const involved = new Set<number>();
    if (request.assigned_provider_id) involved.add(request.assigned_provider_id);
    await repo.setStatus(tx, id, 'cancelled');
    const cancelledAppointments = await appointmentsRepo.cancelActiveForRequest(tx, id);
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'CARE_REQUEST_CANCELLED',
      entityType: 'care_request',
      entityId: id,
      ip: c.ip,
      metadata: { cancelled_appointments: cancelledAppointments },
    });
    for (const providerId of involved) {
      const staff = await notifications.providerStaffIds(tx, providerId);
      await notifications.notify(tx, staff, 'request_cancelled', {
        request_id: id,
        provider: await notifications.providerName(tx, providerId),
      });
    }
    return { id, status: 'cancelled' };
  });
}

export async function assigned(c: Ctx, q: z.infer<typeof AssignedQuery>) {
  const providerIds = await scopeFor(c, q.provider_id);
  return repo.listAssigned(pool, {
    ...q,
    providerIds,
    providerId: isPlatformStaff(c.user) ? q.provider_id : undefined,
  });
}

/**
 * Journey steps the assigned provider moves a request through, and the audit action for each.
 * `requiresVisit` marks the steps that may only happen after the patient has been seen
 * (an appointment `checked_in` or `completed`) — clinical governance, see VISIT_REQUIRED.
 */
export const JOURNEY_STEPS = {
  'start-assessment': { to: 'assessment', action: 'CARE_REQUEST_ASSESSMENT_STARTED' },
  'plan-treatment': {
    to: 'treatment_planned',
    action: 'CARE_REQUEST_TREATMENT_PLANNED',
    requiresVisit: true,
  },
  'start-treatment': {
    to: 'in_progress',
    action: 'CARE_REQUEST_TREATMENT_STARTED',
    requiresVisit: true,
  },
  complete: { to: 'completed', action: 'CARE_REQUEST_COMPLETED' },
} as const;
export type JourneyStep = keyof typeof JOURNEY_STEPS;

/** Only clinicians/owners of the assigned provider (or platform staff) progress the clinical journey. */
export async function progress(c: Ctx, id: number, step: JourneyStep) {
  const { to, action, requiresVisit } = JOURNEY_STEPS[
    step
  ] as (typeof JOURNEY_STEPS)[JourneyStep] & {
    requiresVisit?: boolean;
  };
  return withTransaction(async (tx) => {
    const request = await repo.findById(tx, id, { forUpdate: true });
    if (!request || !request.assigned_provider_id) throw AppError.notFound('Care request');
    await assertCanActForProvider(tx, c.user, request.assigned_provider_id, ['owner', 'clinician']);
    assertTransition('care_request', request.status, to);
    // Treatment planning and treatment itself follow an in-person assessment, never precede it.
    if (requiresVisit) await appointmentsService.assertVisitHappened(tx, id);
    await repo.setStatus(tx, id, to);
    await audit(tx, {
      actorUserId: c.user.id,
      action,
      entityType: 'care_request',
      entityId: id,
      ip: c.ip,
      metadata: { from: request.status, to },
    });
    await notifications.notify(tx, [request.patient_user_id], 'request_progress', {
      request_id: id,
      step: to,
    });
    return { id, status: to };
  });
}

export async function matches(c: Ctx, id: number) {
  const request = await repo.findById(pool, id);
  if (!request) throw AppError.notFound('Care request');
  if (c.user.role === 'patient' && request.patient_user_id !== c.user.id) {
    throw AppError.notFound('Care request');
  }

  const [providers] = await pool.query<Row[]>(
    `SELECT id, legal_name, display_name, provider_type, city, address, specialties,
            (SELECT COUNT(*) FROM provider_schedules ps WHERE ps.provider_id = providers.id AND ps.is_active = 1) AS active_schedules,
            (SELECT COUNT(*) FROM provider_slots sl WHERE sl.provider_id = providers.id AND sl.status = 'available' AND sl.start_time > NOW()) AS available_slots
       FROM providers
      WHERE verification_status = 'verified' AND status = 'active'`,
  );

  return providers
    .map((p) => {
      let specialtiesArr: string[];
      try {
        specialtiesArr =
          typeof p.specialties === 'string'
            ? JSON.parse(p.specialties)
            : ((p.specialties as string[]) ?? []);
      } catch {
        specialtiesArr = [];
      }

      const categoryLower = String(request.specialty).toLowerCase();
      let clinicalFit = 10;
      if (specialtiesArr.some((s) => s.toLowerCase().includes(categoryLower))) {
        clinicalFit = 40;
      } else if (
        specialtiesArr.some(
          (s) => s.toLowerCase().includes('dentist') || s.toLowerCase().includes('dental'),
        )
      ) {
        clinicalFit = 30;
      }

      const verificationScore = 20;

      let locationFit = 10;
      if (p.city && p.city.toLowerCase() === request.preferred_city.toLowerCase()) {
        locationFit = 20;
      }

      const availabilityScore =
        Number(p.available_slots) > 0 ? 10 : Number(p.active_schedules) > 0 ? 7 : 4;
      const performanceScore = 10;

      const totalScore =
        clinicalFit + verificationScore + locationFit + availabilityScore + performanceScore;
      const tier = totalScore >= 85 ? 'excellent' : totalScore >= 70 ? 'good' : 'fair';

      return {
        provider_id: p.id,
        display_name: p.display_name,
        city: p.city,
        address: p.address,
        specialties: specialtiesArr,
        score: {
          total: totalScore,
          tier,
          breakdown: {
            clinical_fit: clinicalFit,
            verification: verificationScore,
            location_fit: locationFit,
            availability: availabilityScore,
            performance: performanceScore,
          },
        },
      };
    })
    .sort((a, b) => b.score.total - a.score.total);
}
