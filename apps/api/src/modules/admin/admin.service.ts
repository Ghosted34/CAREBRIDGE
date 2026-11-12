import type { z } from 'zod';
import { pool, withTransaction } from '../../db/pool.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import type {
  AddMemberBody,
  AuditLogsQuery,
  CreateProviderBody,
  ProvidersQuery,
  UsersQuery,
} from './admin.schema.js';
import * as notifications from '../notifications/notifications.service.js';
import * as repo from './admin.repo.js';

export const metrics = () => repo.metrics(pool);
export const listUsers = (q: z.infer<typeof UsersQuery>) => repo.listUsers(pool, q);
export const listProviders = (q: z.infer<typeof ProvidersQuery>) => repo.listProviders(pool, q);
export const listAuditLogs = (q: z.infer<typeof AuditLogsQuery>) => repo.listAuditLogs(pool, q);
export const listStuckRequests = () => repo.listStuckRequests(pool);

export async function listMembers(providerId: number) {
  if (!(await repo.findProvider(pool, providerId))) throw AppError.notFound('Provider');
  return repo.listMembers(pool, providerId);
}

export async function setUserStatus(c: Ctx, userId: number, status: 'active' | 'suspended') {
  if (userId === c.user.id)
    throw AppError.conflict('SELF_CHANGE', 'You cannot change your own status');
  return withTransaction(async (tx) => {
    const user = await repo.findUser(tx, userId);
    if (!user) throw AppError.notFound('User');
    await repo.setUserStatus(tx, userId, status);
    await audit(tx, {
      actorUserId: c.user.id,
      action: status === 'active' ? 'USER_ACTIVATED' : 'USER_SUSPENDED',
      entityType: 'user',
      entityId: userId,
      ip: c.ip,
      metadata: { from: user.status },
    });
    if (user.role === 'provider_staff' && user.status === 'pending' && status === 'active') {
      await notifications.notify(tx, [userId], 'account_approved', {});
    }
    return { id: userId, status };
  });
}

export async function createProvider(c: Ctx, input: z.infer<typeof CreateProviderBody>) {
  return withTransaction(async (tx) => {
    let id: number;
    try {
      id = await repo.insertProvider(tx, input);
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw AppError.conflict(
          'DUPLICATE_PROVIDER',
          'A provider with this registration number exists',
        );
      }
      throw err;
    }
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'PROVIDER_CREATED',
      entityType: 'provider',
      entityId: id,
      ip: c.ip,
    });
    return { id, verification_status: 'pending' };
  });
}

export async function setVerification(
  c: Ctx,
  providerId: number,
  status: 'verified' | 'rejected' | 'suspended',
) {
  return withTransaction(async (tx) => {
    const provider = await repo.findProvider(tx, providerId);
    if (!provider) throw AppError.notFound('Provider');
    await repo.setVerification(tx, providerId, status);
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'PROVIDER_VERIFICATION_CHANGED',
      entityType: 'provider',
      entityId: providerId,
      ip: c.ip,
      metadata: { from: provider.verification_status, to: status },
    });
    // A clinic that signed itself up has one approval step: verifying the facility also activates
    // its owner's pending account (they could not sign in otherwise). Suspended accounts stay as they are.
    const activated: number[] = [];
    if (status === 'verified') {
      for (const userId of await repo.pendingOwnerIds(tx, providerId)) {
        await repo.setUserStatus(tx, userId, 'active');
        await audit(tx, {
          actorUserId: c.user.id,
          action: 'USER_ACTIVATED',
          entityType: 'user',
          entityId: userId,
          ip: c.ip,
          metadata: { from: 'pending', via: 'provider_verification', provider_id: providerId },
        });
        await notifications.notify(tx, [userId], 'account_approved', {});
        activated.push(userId);
      }
    }
    return { id: providerId, verification_status: status, activated_owners: activated };
  });
}

export async function addMember(c: Ctx, providerId: number, input: z.infer<typeof AddMemberBody>) {
  return withTransaction(async (tx) => {
    if (!(await repo.findProvider(tx, providerId))) throw AppError.notFound('Provider');
    const user = await repo.findUser(tx, input.user_id);
    if (!user) throw AppError.notFound('User');
    if (user.role !== 'provider_staff') {
      throw AppError.conflict(
        'NOT_PROVIDER_STAFF',
        'Only provider_staff accounts can be linked to a provider',
      );
    }
    await repo.upsertMember(tx, providerId, input.user_id, input.provider_role);
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'PROVIDER_MEMBER_SET',
      entityType: 'provider',
      entityId: providerId,
      ip: c.ip,
      metadata: { user_id: input.user_id, provider_role: input.provider_role },
    });
    return { provider_id: providerId, user_id: input.user_id, provider_role: input.provider_role };
  });
}

export async function removeMember(c: Ctx, providerId: number, userId: number) {
  return withTransaction(async (tx) => {
    if (!(await repo.removeMember(tx, providerId, userId))) throw AppError.notFound('Membership');
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'PROVIDER_MEMBER_REMOVED',
      entityType: 'provider',
      entityId: providerId,
      ip: c.ip,
      metadata: { user_id: userId },
    });
    return { provider_id: providerId, user_id: userId, removed: true };
  });
}
