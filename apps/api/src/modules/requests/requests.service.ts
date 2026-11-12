import { pool, withTransaction } from '../../db/pool.js';
import { isPlatformStaff, memberProviderIds } from '../../lib/access.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import { assertTransition } from '../../lib/stateMachine.js';
import type { Pagination } from '../../lib/validate.js';
import * as appointmentsRepo from '../appointments/appointments.repo.js';
import * as notifications from '../notifications/notifications.service.js';
import * as repo from './requests.repo.js';

/**
 * A care request is the "visit" a booking belongs to: created when a patient books (POST /appointments)
 * and closed by the clinic's closing note. Patients see their visits here and may cancel one.
 */
export const listMine = (c: Ctx, page: Pagination) => repo.listForPatient(pool, c.user.id, page);

/** Its patient, platform staff, and staff of the clinic it's with may read it; others get 404. */
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
