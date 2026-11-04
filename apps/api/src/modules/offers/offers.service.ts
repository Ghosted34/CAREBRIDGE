import { pool, withTransaction, type Row } from '../../db/pool.js';
import { assertCanActForProvider, isPlatformStaff, memberProviderIds } from '../../lib/access.js';
import type { Pagination } from '../../lib/validate.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import { assertTransition, canTransition } from '../../lib/stateMachine.js';
import * as requestsRepo from '../requests/requests.repo.js';
import * as repo from './offers.repo.js';

/** A provider (or an operator on its behalf) offers to take on a care request. */
export async function create(
  c: Ctx,
  requestId: number,
  input: { provider_id: number; message?: string | undefined },
) {
  return withTransaction(async (tx) => {
    const [providers] = await tx.execute<Row[]>(
      `SELECT id FROM providers WHERE id = ? AND verification_status = 'verified' AND status = 'active'`,
      [input.provider_id],
    );
    if (!providers[0]) throw AppError.notFound('Verified provider');
    // Only owners, clinicians and schedulers may commit their provider to a patient.
    await assertCanActForProvider(tx, c.user, input.provider_id, [
      'owner',
      'clinician',
      'scheduler',
    ]);

    const request = await requestsRepo.findById(tx, requestId, { forUpdate: true });
    if (!request) throw AppError.notFound('Care request');
    if (!['submitted', 'matching'].includes(request.status)) {
      throw AppError.conflict('REQUEST_NOT_OPEN', 'This request is no longer accepting offers');
    }

    let offerId: number;
    try {
      offerId = await repo.insert(tx, {
        care_request_id: requestId,
        provider_id: input.provider_id,
        offered_by_user_id: c.user.id,
        message: input.message ?? null,
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw AppError.conflict(
          'DUPLICATE_OFFER',
          'This provider has already made an offer on this request',
        );
      }
      throw err;
    }
    if (request.status === 'submitted') {
      assertTransition('care_request', request.status, 'matching');
      await requestsRepo.setStatus(tx, requestId, 'matching');
    }
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'OFFER_CREATED',
      entityType: 'provider_offer',
      entityId: offerId,
      ip: c.ip,
      metadata: { care_request_id: requestId, provider_id: input.provider_id },
    });
    return { id: offerId, status: 'offered' };
  });
}

/** Patient (or platform staff) sees the offers on a request so they can choose one. */
export async function listForRequest(c: Ctx, requestId: number) {
  const request = await requestsRepo.findById(pool, requestId);
  const owns = request && c.user.role === 'patient' && request.patient_user_id === c.user.id;
  if (!request || !(owns || isPlatformStaff(c.user))) throw AppError.notFound('Care request');
  return repo.listForRequest(pool, requestId);
}

/**
 * The patient accepts or declines an offer. Accepting assigns the provider to the
 * request and expires all other open offers. Accepting is NOT an appointment.
 */
export async function respond(c: Ctx, offerId: number, decision: 'accepted' | 'declined') {
  return withTransaction(async (tx) => {
    const offer = await repo.findById(tx, offerId, { forUpdate: true });
    if (!offer) throw AppError.notFound('Offer');
    const request = await requestsRepo.findById(tx, offer.care_request_id, { forUpdate: true });
    if (!request || request.patient_user_id !== c.user.id) throw AppError.notFound('Offer');

    assertTransition('provider_offer', offer.status, decision);
    if (decision === 'accepted') {
      if (!canTransition('care_request', request.status, 'provider_accepted')) {
        throw AppError.conflict('REQUEST_NOT_OPEN', 'This request can no longer accept an offer');
      }
      await repo.setStatus(tx, offerId, 'accepted');
      await requestsRepo.setStatus(tx, request.id, 'provider_accepted', offer.provider_id);
      await repo.expireOpenForRequest(tx, request.id, offerId);
    } else {
      await repo.setStatus(tx, offerId, 'declined');
    }
    await audit(tx, {
      actorUserId: c.user.id,
      action: decision === 'accepted' ? 'OFFER_ACCEPTED' : 'OFFER_DECLINED',
      entityType: 'provider_offer',
      entityId: offerId,
      ip: c.ip,
      metadata: { care_request_id: request.id, provider_id: offer.provider_id },
    });
    return { id: offerId, status: decision };
  });
}

/** The offering provider (or platform staff) withdraws an offer the patient hasn't answered. */
export async function withdraw(c: Ctx, offerId: number) {
  return withTransaction(async (tx) => {
    const offer = await repo.findById(tx, offerId, { forUpdate: true });
    if (!offer) throw AppError.notFound('Offer');
    await assertCanActForProvider(tx, c.user, offer.provider_id, [
      'owner',
      'clinician',
      'scheduler',
    ]);
    assertTransition('provider_offer', offer.status, 'withdrawn');
    await repo.setStatus(tx, offerId, 'withdrawn');
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'OFFER_WITHDRAWN',
      entityType: 'provider_offer',
      entityId: offerId,
      ip: c.ip,
    });
    return { id: offerId, status: 'withdrawn' };
  });
}

/** Provider staff: offers made by their providers. Platform staff: all offers. */
export async function listMine(c: Ctx, page: Pagination) {
  const providerIds = isPlatformStaff(c.user) ? null : await memberProviderIds(pool, c.user.id);
  return repo.listForProviders(pool, providerIds, page);
}
