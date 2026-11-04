import type { Db, Row } from '../db/pool.js';
import type { AuthUser, ProviderRole } from '../types.js';
import { PLATFORM_STAFF } from '../types.js';
import { AppError } from './errors.js';

export const isPlatformStaff = (u: AuthUser) => PLATFORM_STAFF.includes(u.role);

/** IDs of verified, active providers the user is a member of. */
export async function memberProviderIds(db: Db, userId: number): Promise<number[]> {
  const [rows] = await db.execute<Row[]>(
    `SELECT pu.provider_id FROM provider_users pu
       JOIN providers p ON p.id = pu.provider_id
      WHERE pu.user_id = ? AND p.verification_status = 'verified' AND p.status = 'active'`,
    [userId],
  );
  return rows.map((r) => r.provider_id as number);
}

/**
 * Throws 403 unless the user may act for `providerId`.
 * Operators/admins always may; provider staff need a membership with one of `roles`.
 */
export async function assertCanActForProvider(
  db: Db,
  user: AuthUser,
  providerId: number,
  roles: readonly ProviderRole[] = ['owner', 'clinician', 'scheduler', 'receptionist'],
): Promise<void> {
  if (isPlatformStaff(user)) return;
  if (user.role !== 'provider_staff') throw AppError.forbidden();
  const [rows] = await db.execute<Row[]>(
    `SELECT pu.provider_role FROM provider_users pu
       JOIN providers p ON p.id = pu.provider_id
      WHERE pu.user_id = ? AND pu.provider_id = ?
        AND p.verification_status = 'verified' AND p.status = 'active'`,
    [user.id, providerId],
  );
  const membership = rows[0];
  if (!membership || !roles.includes(membership.provider_role)) {
    throw AppError.forbidden('You are not authorised to act for this provider');
  }
}
