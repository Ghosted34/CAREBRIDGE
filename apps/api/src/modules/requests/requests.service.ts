import type { z } from 'zod';
import { pool, withTransaction } from '../../db/pool.js';
import { assertCanActForProvider, isPlatformStaff, memberProviderIds } from '../../lib/access.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import { assertTransition } from '../../lib/stateMachine.js';
import type { Pagination } from '../../lib/validate.js';
import * as offersRepo from '../offers/offers.repo.js';
import * as appointmentsRepo from '../appointments/appointments.repo.js';
import type { AssignedQuery, CreateRequestBody, QueueQuery } from './requests.schema.js';
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
  return withTransaction(async (tx) => {
    const id = await repo.insert(tx, { ...input, patient_user_id: c.user.id });
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'CARE_REQUEST_CREATED',
      entityType: 'care_request',
      entityId: id,
      ip: c.ip,
    });
    return { id, status: 'submitted' };
  });
}

export const listMine = (c: Ctx, page: Pagination) => repo.listForPatient(pool, c.user.id, page);

export async function queue(c: Ctx, q: z.infer<typeof QueueQuery>) {
  const providerIds = isPlatformStaff(c.user) ? null : await memberProviderIds(pool, c.user.id);
  return repo.listQueue(pool, { ...q, providerIds });
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
    const related = [request.assigned_provider_id, ...(await repo.offeringProviderIds(pool, id))];
    if (related.some((pid) => pid && mine.includes(pid))) return request;
  }
  throw AppError.notFound('Care request'); // 404, not 403: don't confirm the request exists
}

export async function cancel(c: Ctx, id: number) {
  return withTransaction(async (tx) => {
    const request = await repo.findById(tx, id, { forUpdate: true });
    const owns = request && c.user.role === 'patient' && request.patient_user_id === c.user.id;
    if (!request || !(owns || isPlatformStaff(c.user))) throw AppError.notFound('Care request');
    assertTransition('care_request', request.status, 'cancelled');
    await repo.setStatus(tx, id, 'cancelled');
    const expired = await offersRepo.expireOpenForRequest(tx, id);
    const cancelledAppointments = await appointmentsRepo.cancelActiveForRequest(tx, id);
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'CARE_REQUEST_CANCELLED',
      entityType: 'care_request',
      entityId: id,
      ip: c.ip,
      metadata: { expired_offers: expired, cancelled_appointments: cancelledAppointments },
    });
    return { id, status: 'cancelled' };
  });
}

export async function assigned(c: Ctx, q: z.infer<typeof AssignedQuery>) {
  const providerIds = isPlatformStaff(c.user) ? null : await memberProviderIds(pool, c.user.id);
  return repo.listAssigned(pool, { ...q, providerIds });
}

/** Journey steps the assigned provider moves a request through, and the audit action for each. */
export const JOURNEY_STEPS = {
  'start-assessment': { to: 'assessment', action: 'CARE_REQUEST_ASSESSMENT_STARTED' },
  'plan-treatment': { to: 'treatment_planned', action: 'CARE_REQUEST_TREATMENT_PLANNED' },
  'start-treatment': { to: 'in_progress', action: 'CARE_REQUEST_TREATMENT_STARTED' },
  complete: { to: 'completed', action: 'CARE_REQUEST_COMPLETED' },
} as const;
export type JourneyStep = keyof typeof JOURNEY_STEPS;

/** Only clinicians/owners of the assigned provider (or platform staff) progress the clinical journey. */
export async function progress(c: Ctx, id: number, step: JourneyStep) {
  const { to, action } = JOURNEY_STEPS[step];
  return withTransaction(async (tx) => {
    const request = await repo.findById(tx, id, { forUpdate: true });
    if (!request || !request.assigned_provider_id) throw AppError.notFound('Care request');
    await assertCanActForProvider(tx, c.user, request.assigned_provider_id, ['owner', 'clinician']);
    assertTransition('care_request', request.status, to);
    await repo.setStatus(tx, id, to);
    await audit(tx, {
      actorUserId: c.user.id,
      action,
      entityType: 'care_request',
      entityId: id,
      ip: c.ip,
      metadata: { from: request.status, to },
    });
    return { id, status: to };
  });
}
