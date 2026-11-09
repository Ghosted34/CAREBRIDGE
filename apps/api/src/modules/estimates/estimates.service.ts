import { pool, withTransaction } from '../../db/pool.js';
import { assertCanActForProvider, isPlatformStaff, memberProviderIds } from '../../lib/access.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import { assertTransition } from '../../lib/stateMachine.js';
import { assertVisitHappened } from '../appointments/appointments.service.js';
import * as notifications from '../notifications/notifications.service.js';
import * as requestsRepo from '../requests/requests.repo.js';
import * as repo from './estimates.repo.js';
import type { CreateEstimateBody } from './estimates.schema.js';

export async function create(ctx: Ctx, careRequestId: number, body: CreateEstimateBody) {
  return withTransaction(async (tx) => {
    const request = await requestsRepo.findById(tx, careRequestId, { forUpdate: true });
    if (!request) throw AppError.notFound('Care request');

    if (!request.assigned_provider_id) {
      throw AppError.conflict(
        'NO_ASSIGNED_PROVIDER',
        'Cannot issue an estimate without an assigned provider',
      );
    }

    const providerId = request.assigned_provider_id;
    await assertCanActForProvider(tx, ctx.user, providerId, ['owner', 'clinician', 'scheduler']);
    // Clinical governance: pricing follows an in-person assessment, never precedes it.
    await assertVisitHappened(tx, careRequestId);

    const validUntil = body.valid_until ? new Date(body.valid_until) : null;
    const id = await repo.insert(tx, {
      care_request_id: careRequestId,
      provider_id: providerId,
      currency: body.currency,
      amount: body.amount,
      inclusions: body.inclusions,
      exclusions: body.exclusions,
      valid_until: validUntil,
      status: 'issued',
    });

    await audit(tx, {
      actorUserId: ctx.user.id,
      action: 'ESTIMATE_ISSUED',
      entityType: 'service_estimate',
      entityId: id,
      ip: ctx.ip,
      metadata: {
        care_request_id: careRequestId,
        provider_id: providerId,
        currency: body.currency,
        amount: body.amount,
      },
    });

    const providerName = await notifications.providerName(tx, providerId);
    await notifications.notify(tx, [request.patient_user_id], 'estimate_issued', {
      request_id: careRequestId,
      provider: providerName,
      amount: `${body.currency} ${Number(body.amount).toLocaleString()}`,
    });

    return repo.findById(tx, id);
  });
}

export async function respond(ctx: Ctx, id: number, decision: 'accepted' | 'rejected') {
  return withTransaction(async (tx) => {
    const estimate = await repo.findById(tx, id, { forUpdate: true });
    if (!estimate) throw AppError.notFound('Estimate');

    const request = await requestsRepo.findById(tx, estimate.care_request_id);
    if (!request) throw AppError.notFound('Care request');

    if (request.patient_user_id !== ctx.user.id) {
      throw AppError.forbidden();
    }

    assertTransition('service_estimate', estimate.status, decision);
    await repo.updateStatus(tx, id, decision);

    await audit(tx, {
      actorUserId: ctx.user.id,
      action: decision === 'accepted' ? 'ESTIMATE_ACCEPTED' : 'ESTIMATE_REJECTED',
      entityType: 'service_estimate',
      entityId: id,
      ip: ctx.ip,
      metadata: { care_request_id: estimate.care_request_id },
    });

    const staff = await notifications.providerStaffIds(tx, estimate.provider_id, [
      'owner',
      'clinician',
      'scheduler',
    ]);
    await notifications.notify(
      tx,
      staff,
      decision === 'accepted' ? 'estimate_accepted' : 'estimate_rejected',
      {
        request_id: estimate.care_request_id,
      },
    );

    return repo.findById(tx, id);
  });
}

export async function listForRequest(ctx: Ctx, careRequestId: number) {
  const request = await requestsRepo.findById(pool, careRequestId);
  if (!request) throw AppError.notFound('Care request');

  if (ctx.user.role === 'patient') {
    if (request.patient_user_id !== ctx.user.id) throw AppError.notFound('Care request');
  } else if (!isPlatformStaff(ctx.user)) {
    const myProviders = await memberProviderIds(pool, ctx.user.id);
    if (!request.assigned_provider_id || !myProviders.includes(request.assigned_provider_id)) {
      throw AppError.forbidden();
    }
  }

  return repo.findByRequest(pool, careRequestId);
}
