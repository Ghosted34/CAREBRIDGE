import type { z } from 'zod';
import { pool, withTransaction, type Db } from '../../db/pool.js';
import { assertOwnsAClinic, isPlatformStaff } from '../../lib/access.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import type { AuthUser } from '../../types.js';
import * as notifications from '../notifications/notifications.service.js';
import * as requestsRepo from '../requests/requests.repo.js';
import type {
  AddTeamMemberBody,
  CreateCaregiverBody,
  CreateCentreBody,
  CreateProviderFeeBody,
  SearchStaffQuery,
  UpdateCentreBody,
  UpdateProviderFeeBody,
} from './providers.schema.js';
import * as repo from './providers.repo.js';

/**
 * The caller's role at this clinic, ignoring verification state, so a clinic that is still awaiting
 * review gets a clear "not verified yet" answer instead of a bare 403. Platform staff pass through:
 * they coordinate on CareBridge's behalf.
 */
async function roleAt(db: Db, user: AuthUser, providerId: number) {
  if (isPlatformStaff(user)) return 'owner' as const;
  if (user.role !== 'provider_staff') throw AppError.forbidden();
  const membership = await repo.findMembership(db, providerId, user.id);
  if (!membership) throw AppError.forbidden('You are not a member of this provider');
  return membership.provider_role as string;
}

/** Only the clinic owner (or platform staff) manages the roster. */
async function assertOwner(db: Db, user: AuthUser, providerId: number) {
  if ((await roleAt(db, user, providerId)) !== 'owner') {
    throw AppError.forbidden('Only the clinic owner can manage the team');
  }
}

/** Team management is self-service, but only once CareBridge has verified the facility. */
async function assertVerifiedClinic(db: Db, providerId: number) {
  const provider = await repo.findProvider(db, providerId);
  if (!provider) throw AppError.notFound('Provider');
  if (provider.verification_status !== 'verified' || provider.status !== 'active') {
    throw AppError.conflict(
      'PROVIDER_NOT_VERIFIED',
      'Your facility is still awaiting CareBridge verification, so team management is locked',
    );
  }
  return provider;
}

/** Any member of the clinic (or platform staff) may see who works there, verified or not. */
export async function listTeam(c: Ctx, providerId: number) {
  await roleAt(pool, c.user, providerId);
  if (!(await repo.findProvider(pool, providerId))) throw AppError.notFound('Provider');
  return repo.listMembers(pool, providerId);
}

/**
 * Clinic owners add, invite and re-role their own team (clinician, scheduler, receptionist)
 * without going through CareBridge. An invited account that is still pending is activated: the
 * verified owner has vouched for them, and their facility is already approved.
 */
export async function addTeamMember(
  c: Ctx,
  providerId: number,
  input: z.infer<typeof AddTeamMemberBody>,
) {
  return withTransaction(async (tx) => {
    await assertOwner(tx, c.user, providerId);
    const provider = await assertVerifiedClinic(tx, providerId);
    const user = await repo.findUser(tx, input.user_id);
    if (!user) throw AppError.notFound('User');
    if (user.role !== 'provider_staff') {
      throw AppError.conflict(
        'NOT_PROVIDER_STAFF',
        'Only provider_staff accounts can be linked to a clinic',
      );
    }
    if (user.status === 'suspended') {
      throw AppError.conflict(
        'ACCOUNT_SUSPENDED',
        'This account is suspended and cannot be added to a clinic',
      );
    }
    await repo.upsertMember(tx, providerId, input.user_id, input.provider_role);
    const activated = user.status === 'pending';
    if (activated) await repo.setUserStatus(tx, input.user_id, 'active');
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'PROVIDER_MEMBER_SET',
      entityType: 'provider',
      entityId: providerId,
      ip: c.ip,
      metadata: {
        user_id: input.user_id,
        provider_role: input.provider_role,
        managed_by: 'clinic_owner',
        activated,
      },
    });
    if (activated) {
      await audit(tx, {
        actorUserId: c.user.id,
        action: 'USER_ACTIVATED',
        entityType: 'user',
        entityId: input.user_id,
        ip: c.ip,
        metadata: { from: 'pending', by: 'clinic_owner' },
      });
      await notifications.notify(tx, [input.user_id], 'account_approved', {});
    }
    await notifications.notify(tx, [input.user_id], 'team_invite', {
      provider: provider.display_name as string,
      role: input.provider_role,
    });
    return {
      provider_id: providerId,
      user_id: input.user_id,
      provider_role: input.provider_role,
      activated,
    };
  });
}

/** Owners remove their own team members. Nobody may remove an owner — CareBridge does that. */
export async function removeTeamMember(c: Ctx, providerId: number, userId: number) {
  return withTransaction(async (tx) => {
    await assertOwner(tx, c.user, providerId);
    await assertVerifiedClinic(tx, providerId);
    if (userId === c.user.id) {
      throw AppError.conflict('SELF_CHANGE', 'You cannot remove yourself from your own clinic');
    }
    const member = await repo.findMembership(tx, providerId, userId);
    if (!member) throw AppError.notFound('Membership');
    if (member.provider_role === 'owner') {
      throw AppError.conflict(
        'OWNER_CHANGE_FORBIDDEN',
        'Clinic ownership is changed by CareBridge, not by the clinic',
      );
    }
    await repo.removeMember(tx, providerId, userId);
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'PROVIDER_MEMBER_REMOVED',
      entityType: 'provider',
      entityId: providerId,
      ip: c.ip,
      metadata: { user_id: userId, managed_by: 'clinic_owner' },
    });
    return { provider_id: providerId, user_id: userId, removed: true };
  });
}

/**
 * Staff accounts a clinic owner may invite, by email or name. Only owners of a verified clinic
 * (and platform staff) may look people up, and only contact details are returned — one clinic must
 * not be able to enumerate another clinic's roster.
 */
export async function searchStaff(c: Ctx, q: z.infer<typeof SearchStaffQuery>) {
  await assertOwnsAClinic(pool, c.user);
  return repo.searchStaffAccounts(pool, q.q, q.limit);
}

/** Clinic owner lists the operating centres of their facility.
 * Patients may read centres to browse for booking; care_request_id is optional
 * and only used when the patient already has an open request they're continuing. */
export async function listCentres(c: Ctx, providerId: number, careRequestId?: number) {
  if (c.user.role === 'patient') {
    if (careRequestId !== undefined) {
      const request = await requestsRepo.findById(pool, careRequestId);
      if (!request || request.patient_user_id !== c.user.id)
        throw AppError.notFound('Care request');
      if (!['submitted', 'matching'].includes(request.status))
        throw AppError.forbidden('Cannot view centres for this request');
    }
  } else {
    await assertOwner(pool, c.user, providerId);
  }
  const provider = await repo.findProvider(pool, providerId);
  if (!provider) throw AppError.notFound('Provider');
  return repo.listCentres(pool, providerId);
}

/** Clinic owner adds a new operating centre to their facility. */
export async function createCentre(
  c: Ctx,
  providerId: number,
  body: z.infer<typeof CreateCentreBody>,
) {
  return withTransaction(async (tx) => {
    await assertOwner(tx, c.user, providerId);
    const provider = await assertVerifiedClinic(tx, providerId);
    const id = await repo.insertCentre(tx, providerId, {
      name: body.name,
      address_line: body.address_line,
      city: body.city,
      state: body.state,
      postal_code: body.postal_code,
      phone: body.phone ?? null,
      latitude: null,
      longitude: null,
    });
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'PROVIDER_CENTRE_CREATED',
      entityType: 'provider_centre',
      entityId: id,
      ip: c.ip,
      metadata: { provider_id: providerId, name: body.name },
    });
    await notifications.notify(tx, [c.user.id], 'team_invite', {
      provider: provider.display_name as string,
      role: 'centre_added',
    });
    return { id, provider_id: providerId, ...body };
  });
}

/** Clinic owner updates an operating centre. */
export async function updateCentre(
  c: Ctx,
  providerId: number,
  centreId: number,
  body: z.infer<typeof UpdateCentreBody>,
) {
  return withTransaction(async (tx) => {
    await assertOwner(tx, c.user, providerId);
    const centre = await repo.findCentre(tx, centreId);
    if (!centre || centre.provider_id !== providerId) throw AppError.notFound('Centre');
    await repo.updateCentre(tx, centreId, providerId, body);
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'PROVIDER_CENTRE_UPDATED',
      entityType: 'provider_centre',
      entityId: centreId,
      ip: c.ip,
      metadata: { provider_id: providerId },
    });
    return repo.findCentre(tx, centreId);
  });
}

/** Clinic owner lists caregivers at a centre.
 * Patients may read caregivers to browse for booking; care_request_id is optional
 * and only used when the patient already has an open request they're continuing. */
export async function listCaregivers(c: Ctx, providerId: number, careRequestId?: number) {
  if (c.user.role === 'patient') {
    if (careRequestId !== undefined) {
      const request = await requestsRepo.findById(pool, careRequestId);
      if (!request || request.patient_user_id !== c.user.id)
        throw AppError.notFound('Care request');
      if (!['submitted', 'matching'].includes(request.status))
        throw AppError.forbidden('Cannot view caregivers for this request');
    }
  } else {
    await assertOwner(pool, c.user, providerId);
  }
  const provider = await repo.findProvider(pool, providerId);
  if (!provider) throw AppError.notFound('Provider');
  return repo.listCaregivers(pool, providerId);
}

/** Clinic owner adds a caregiver to a centre. */
export async function createCaregiver(
  c: Ctx,
  providerId: number,
  body: z.infer<typeof CreateCaregiverBody>,
) {
  return withTransaction(async (tx) => {
    await assertOwner(tx, c.user, providerId);
    const centre = await repo.findCentre(tx, body.centre_id);
    if (!centre || centre.provider_id !== providerId) throw AppError.notFound('Centre');
    const id = await repo.insertCaregiver(
      tx,
      providerId,
      body.centre_id,
      body.full_name,
      body.role,
    );
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'PROVIDER_CAREGIVER_CREATED',
      entityType: 'provider_caregiver',
      entityId: id,
      ip: c.ip,
      metadata: { provider_id: providerId, centre_id: body.centre_id, role: body.role },
    });
    return {
      id,
      provider_id: providerId,
      centre_id: body.centre_id,
      full_name: body.full_name,
      role: body.role,
    };
  });
}

/** Clinic owner lists all fee types for their clinic. */
export async function listProviderFees(c: Ctx, providerId: number) {
  await roleAt(pool, c.user, providerId);
  if (!(await repo.findProvider(pool, providerId))) throw AppError.notFound('Provider');
  return repo.listProviderFees(pool, providerId);
}

/** Clinic owner sets or updates a fee type for their clinic (optionally centre-scoped). */
export async function setProviderFee(
  c: Ctx,
  providerId: number,
  input: z.infer<typeof CreateProviderFeeBody>,
) {
  return withTransaction(async (tx) => {
    await assertOwner(tx, c.user, providerId);
    await assertVerifiedClinic(tx, providerId);
    if (input.centre_id) {
      const centre = await repo.findCentre(tx, input.centre_id);
      if (!centre || centre.provider_id !== providerId) throw AppError.notFound('Operating centre');
    }
    // Upsert: delete any existing fee with same (provider_id, centre_id, fee_type), then insert.
    await tx.execute(
      `DELETE FROM provider_fees WHERE provider_id = ? AND centre_id <=> ? AND fee_type = ?`,
      [providerId, input.centre_id ?? null, input.fee_type],
    );
    const id = await repo.insertProviderFee(tx, providerId, {
      centre_id: input.centre_id ?? null,
      fee_type: input.fee_type,
      amount: input.amount,
      currency: input.currency,
      is_active: input.is_active,
    });
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'PROVIDER_FEE_SET',
      entityType: 'provider_fee',
      entityId: id,
      ip: c.ip,
      metadata: {
        provider_id: providerId,
        centre_id: input.centre_id,
        fee_type: input.fee_type,
        amount: input.amount,
      },
    });
    return repo.findProviderFee(tx, providerId, id)!;
  });
}

/** Clinic owner updates a fee. */
export async function updateProviderFee(
  c: Ctx,
  providerId: number,
  feeId: number,
  input: z.infer<typeof UpdateProviderFeeBody>,
) {
  return withTransaction(async (tx) => {
    await assertOwner(tx, c.user, providerId);
    const fee = await repo.findProviderFee(tx, providerId, feeId);
    if (!fee) throw AppError.notFound('Provider fee');
    if (input.centre_id !== undefined && input.centre_id !== null) {
      const centre = await repo.findCentre(tx, input.centre_id);
      if (!centre || centre.provider_id !== providerId) throw AppError.notFound('Operating centre');
    }
    await repo.updateProviderFee(tx, providerId, feeId, {
      centre_id: input.centre_id,
      fee_type: input.fee_type,
      amount: input.amount,
      currency: input.currency,
      is_active: input.is_active,
    });
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'PROVIDER_FEE_UPDATED',
      entityType: 'provider_fee',
      entityId: feeId,
      ip: c.ip,
      metadata: { providerId, feeId },
    });
    return repo.findProviderFee(tx, providerId, feeId)!;
  });
}

/** Clinic owner deletes a fee. */
export async function deleteProviderFee(c: Ctx, providerId: number, feeId: number) {
  return withTransaction(async (tx) => {
    await assertOwner(tx, c.user, providerId);
    const fee = await repo.findProviderFee(tx, providerId, feeId);
    if (!fee) throw AppError.notFound('Provider fee');
    await repo.deleteProviderFee(tx, providerId, feeId);
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'PROVIDER_FEE_DELETED',
      entityType: 'provider_fee',
      entityId: feeId,
      ip: c.ip,
      metadata: { providerId, feeId },
    });
    return { providerId, feeId, removed: true };
  });
}
