import type { Db, Result, Row } from '../../db/pool.js';
import type { Pagination } from '../../lib/validate.js';

// Only these fields are ever exposed publicly.
const PUBLIC_FIELDS = `p.id, p.display_name, p.provider_type, p.city, p.address,
  p.specialties, p.services, p.accepting_referrals`;

export async function listVerified(db: Db, f: { city: string; specialty: string } & Pagination) {
  // LIMIT/OFFSET placeholders need .query(), not .execute(), in mysql2.
  const [rows] = await db.query<Row[]>(
    `SELECT ${PUBLIC_FIELDS} FROM providers p
      WHERE p.verification_status = 'verified' AND p.status = 'active'
        AND p.city = ? AND JSON_CONTAINS(p.specialties, JSON_QUOTE(?))
      ORDER BY p.display_name LIMIT ? OFFSET ?`,
    [f.city, f.specialty, f.limit, f.offset],
  );
  return rows;
}

export async function findVerified(db: Db, id: number) {
  const [rows] = await db.execute<Row[]>(
    `SELECT ${PUBLIC_FIELDS} FROM providers p
      WHERE p.id = ? AND p.verification_status = 'verified' AND p.status = 'active'`,
    [id],
  );
  return rows[0];
}

// ---- clinic team (owner-managed) ----

export async function findProvider(db: Db, id: number) {
  const [rows] = await db.execute<Row[]>(
    `SELECT id, display_name, verification_status, status FROM providers WHERE id = ?`,
    [id],
  );
  return rows[0];
}

export async function listMembers(db: Db, providerId: number) {
  const [rows] = await db.execute<Row[]>(
    `SELECT u.id AS user_id, u.full_name, u.email, u.status, pu.provider_role, pu.created_at
       FROM provider_users pu JOIN users u ON u.id = pu.user_id
      WHERE pu.provider_id = ?
      ORDER BY FIELD(pu.provider_role,'owner','clinician','scheduler','receptionist'), u.full_name`,
    [providerId],
  );
  return rows;
}

/** This user's role at one clinic, whatever the clinic's verification state. */
export async function findMembership(db: Db, providerId: number, userId: number) {
  const [rows] = await db.execute<Row[]>(
    'SELECT provider_role FROM provider_users WHERE provider_id = ? AND user_id = ?',
    [providerId, userId],
  );
  return rows[0];
}

export async function findUser(db: Db, id: number) {
  const [rows] = await db.execute<Row[]>(
    'SELECT id, full_name, email, role, status FROM users WHERE id = ?',
    [id],
  );
  return rows[0];
}

export async function upsertMember(db: Db, providerId: number, userId: number, role: string) {
  await db.execute(
    `INSERT INTO provider_users(provider_id, user_id, provider_role) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE provider_role = VALUES(provider_role)`,
    [providerId, userId, role],
  );
}

export async function removeMember(db: Db, providerId: number, userId: number) {
  const [r] = await db.execute<Result>(
    'DELETE FROM provider_users WHERE provider_id = ? AND user_id = ?',
    [providerId, userId],
  );
  return r.affectedRows;
}

export async function setUserStatus(db: Db, userId: number, status: string) {
  await db.execute('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
}

/**
 * Provider-staff accounts a clinic owner may invite, found by email or name.
 * Contact details only — no patient data, no other clinics' information.
 */
export async function searchStaffAccounts(db: Db, term: string, limit: number) {
  const like = `%${term}%`;
  const [rows] = await db.query<Row[]>(
    `SELECT id, full_name, email, status FROM users
      WHERE role = 'provider_staff' AND (email LIKE ? OR full_name LIKE ?)
      ORDER BY full_name LIMIT ?`,
    [like, like, limit],
  );
  return rows;
}
