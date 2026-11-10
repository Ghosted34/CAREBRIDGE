import { pool, withTransaction, type Db } from '../../db/pool.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import * as requestsRepo from '../requests/requests.repo.js';
import { CONSENT_TYPES, POLICIES, REQUIRED_FOR_REQUESTS, type ConsentType } from './policies.js';
import * as repo from './consents.repo.js';

export type ConsentSource = 'registration' | 'settings' | 'request_form';

export const publicPolicies = () =>
  CONSENT_TYPES.map((t) => {
    const p = POLICIES[t];
    return {
      type: p.type,
      version: p.version,
      title: p.title,
      summary: p.summary,
      required_at_registration: p.requiredAtRegistration,
      required_for_requests: p.requiredForRequests,
    };
  });

/** Current state of every consent type for a user, judged against the current policy versions. */
export async function statusFor(db: Db, userId: number) {
  const latest = new Map((await repo.latestForUser(db, userId)).map((r) => [r.consent_type, r]));
  return CONSENT_TYPES.map((type) => {
    const row = latest.get(type);
    const current = POLICIES[type].version;
    return {
      type,
      current_version: current,
      granted: !!row?.granted,
      granted_version: row?.granted ? row.version : null,
      up_to_date: !!row?.granted && row.version === current,
      decided_at: row?.recorded_at ?? null,
    };
  });
}

/** Throws 409 CONSENT_REQUIRED listing what's missing, unless all `types` are granted at current versions. */
export async function assertConsents(
  db: Db,
  userId: number,
  types: readonly ConsentType[] = REQUIRED_FOR_REQUESTS,
) {
  const status = await statusFor(db, userId);
  const missing = status.filter((s) => types.includes(s.type) && !s.up_to_date).map((s) => s.type);
  if (missing.length) {
    throw new AppError(
      409,
      'CONSENT_REQUIRED',
      'Please review and accept the required agreements first',
      {
        missing,
      },
    );
  }
}

/** Record a grant at the current version. Used at registration (inside its transaction) and from settings. */
export async function grant(
  db: Db,
  userId: number,
  type: ConsentType,
  source: ConsentSource,
  ip: string | null,
) {
  await repo.insert(db, {
    user_id: userId,
    consent_type: type,
    version: POLICIES[type].version,
    granted: true,
    source,
    ip,
  });
  await audit(db, {
    actorUserId: userId,
    action: 'CONSENT_GRANTED',
    entityType: 'user',
    entityId: userId,
    ip,
    metadata: { consent_type: type, version: POLICIES[type].version, source },
  });
}

/**
 * Grant or revoke from the settings page / request form.
 * Revoking data_sharing withdraws the patient's open requests (submitted/matching) from providers:
 * we may no longer share them. Journeys that already have a chosen provider continue.
 */
export async function decide(c: Ctx, type: ConsentType, granted: boolean, source: ConsentSource) {
  if (!granted && POLICIES[type].requiredAtRegistration) {
    throw new AppError(
      409,
      'CONSENT_NOT_REVOCABLE',
      `${POLICIES[type].title} can't be withdrawn while you keep an account. Contact support to close your account.`,
    );
  }
  return withTransaction(async (tx) => {
    let withdrawnRequests: number[] = [];
    if (granted) {
      await grant(tx, c.user.id, type, source, c.ip);
    } else {
      await repo.markRevoked(tx, c.user.id, type);
      await repo.insert(tx, {
        user_id: c.user.id,
        consent_type: type,
        version: POLICIES[type].version,
        granted: false,
        source,
        ip: c.ip,
      });
      if (type === 'data_sharing' && c.user.role === 'patient') {
        withdrawnRequests = await requestsRepo.openIdsForPatient(tx, c.user.id);
        for (const id of withdrawnRequests) {
          await requestsRepo.setStatus(tx, id, 'cancelled');
          await audit(tx, {
            actorUserId: c.user.id,
            action: 'CARE_REQUEST_CANCELLED',
            entityType: 'care_request',
            entityId: id,
            ip: c.ip,
            metadata: { reason: 'data_sharing_consent_revoked' },
          });
        }
      }
      await audit(tx, {
        actorUserId: c.user.id,
        action: 'CONSENT_REVOKED',
        entityType: 'user',
        entityId: c.user.id,
        ip: c.ip,
        metadata: { consent_type: type, withdrawn_requests: withdrawnRequests },
      });
    }
    return { consents: await statusFor(tx, c.user.id), withdrawn_requests: withdrawnRequests };
  });
}

export const mine = (c: Ctx) => statusFor(pool, c.user.id);
