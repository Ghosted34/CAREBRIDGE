import { pool, withTransaction } from '../../db/pool.js';
import { assertCanActForProvider, isPlatformStaff, memberProviderIds } from '../../lib/access.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import { assertTransition } from '../../lib/stateMachine.js';
import * as notifications from '../notifications/notifications.service.js';
import * as providersRepo from '../providers/providers.repo.js';
import * as requestsRepo from '../requests/requests.repo.js';
import * as repo from './referrals.repo.js';
import type { CreateReferralBody, ListReferralsQuery } from './referrals.schema.js';

export async function create(ctx: Ctx, careRequestId: number, body: CreateReferralBody) {
  return withTransaction(async (tx) => {
    const request = await requestsRepo.findById(tx, careRequestId, { forUpdate: true });
    if (!request) throw AppError.notFound('Care request');

    if (!request.assigned_provider_id) {
      throw AppError.conflict('NO_ASSIGNED_PROVIDER', 'Cannot refer without an assigned provider');
    }

    const referringProviderId = request.assigned_provider_id;
    if (referringProviderId === body.receiving_provider_id) {
      throw AppError.badRequest('Cannot refer a patient to the same provider');
    }

    await assertCanActForProvider(tx, ctx.user, referringProviderId, ['owner', 'clinician']);

    const receivingProvider = await providersRepo.findVerified(tx, body.receiving_provider_id);
    if (!receivingProvider) {
      throw AppError.badRequest('Receiving provider must be a verified provider');
    }

    const id = await repo.insert(tx, {
      care_request_id: careRequestId,
      referring_provider_id: referringProviderId,
      receiving_provider_id: body.receiving_provider_id,
      referred_specialty: body.referred_specialty,
      clinical_summary: body.clinical_summary,
      status: 'sent',
    });

    // Audit without clinical summary
    await audit(tx, {
      actorUserId: ctx.user.id,
      action: 'REFERRAL_SENT',
      entityType: 'clinical_referral',
      entityId: id,
      ip: ctx.ip,
      metadata: {
        care_request_id: careRequestId,
        referring_provider_id: referringProviderId,
        receiving_provider_id: body.receiving_provider_id,
        referred_specialty: body.referred_specialty,
      },
    });

    // Notify receiving clinic
    const staff = await notifications.providerStaffIds(tx, body.receiving_provider_id, [
      'owner',
      'clinician',
      'scheduler',
    ]);
    const referringName = await notifications.providerName(tx, referringProviderId);
    await notifications.notify(tx, staff, 'referral_received', {
      request_id: careRequestId,
      provider: referringName,
      specialty: body.referred_specialty,
    });

    return repo.findById(tx, id);
  });
}

export async function respond(ctx: Ctx, id: number, decision: 'accepted' | 'declined') {
  return withTransaction(async (tx) => {
    const referral = await repo.findById(tx, id, { forUpdate: true });
    if (!referral) throw AppError.notFound('Referral');

    await assertCanActForProvider(tx, ctx.user, referral.receiving_provider_id, [
      'owner',
      'clinician',
    ]);
    assertTransition('clinical_referral', referral.status, decision);

    await repo.updateStatus(tx, id, decision);

    await audit(tx, {
      actorUserId: ctx.user.id,
      action: decision === 'accepted' ? 'REFERRAL_ACCEPTED' : 'REFERRAL_DECLINED',
      entityType: 'clinical_referral',
      entityId: id,
      ip: ctx.ip,
      metadata: { care_request_id: referral.care_request_id },
    });

    const staff = await notifications.providerStaffIds(tx, referral.referring_provider_id, [
      'owner',
      'clinician',
    ]);
    const receiverName = await notifications.providerName(tx, referral.receiving_provider_id);
    await notifications.notify(
      tx,
      staff,
      decision === 'accepted' ? 'referral_accepted' : 'referral_declined',
      {
        request_id: referral.care_request_id,
        provider: receiverName,
      },
    );

    return repo.findById(tx, id);
  });
}

export async function complete(ctx: Ctx, id: number) {
  return withTransaction(async (tx) => {
    const referral = await repo.findById(tx, id, { forUpdate: true });
    if (!referral) throw AppError.notFound('Referral');

    await assertCanActForProvider(tx, ctx.user, referral.receiving_provider_id, [
      'owner',
      'clinician',
    ]);
    assertTransition('clinical_referral', referral.status, 'completed');

    await repo.updateStatus(tx, id, 'completed');

    await audit(tx, {
      actorUserId: ctx.user.id,
      action: 'REFERRAL_COMPLETED',
      entityType: 'clinical_referral',
      entityId: id,
      ip: ctx.ip,
      metadata: { care_request_id: referral.care_request_id },
    });

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
    const referrals = await repo.findByRequest(pool, careRequestId);
    return referrals.filter(
      (r) =>
        myProviders.includes(r.referring_provider_id) ||
        myProviders.includes(r.receiving_provider_id),
    );
  }

  return repo.findByRequest(pool, careRequestId);
}

export async function listMine(ctx: Ctx, query: ListReferralsQuery) {
  if (isPlatformStaff(ctx.user)) {
    // Platform staff can see all
    return repo.findForProviders(pool, [], query.type, query.status);
  }
  const myProviders = await memberProviderIds(pool, ctx.user.id);
  if (!myProviders.length) return [];
  return repo.findForProviders(pool, myProviders, query.type, query.status);
}
