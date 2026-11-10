import type { Db, Result, Row } from '../../db/pool.js';
import type { Pagination } from '../../lib/validate.js';

// Only these fields are ever exposed publicly.
const PUBLIC_FIELDS = `p.id, p.display_name, p.provider_type, p.city, p.address,
  p.specialties, p.services, p.accepting_referrals`;

export interface ProviderCentre extends Row {
  id: number;
  provider_id: number;
  name: string;
  address: string;
  city: string;
  phone: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface Caregiver extends Row {
  user_id: number;
  full_name: string;
  is_active: number;
}

export async function listVerified(db: Db, f: { city: string; specialty: string } & Pagination) {
  // LIMIT/OFFSET placeholders need .query(), not .execute(), in mysql2.
  const [rows] = await db.query<Row[]>(
    `SELECT ${PUBLIC_FIELDS},
            GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS centre_names,
            MIN(CASE WHEN s.status = 'available' AND s.start_time > NOW() THEN s.start_time END)
              AS next_available_at
       FROM providers p
       LEFT JOIN provider_centres c ON c.provider_id = p.id AND c.is_active = 1
       LEFT JOIN provider_slots s ON s.provider_id = p.id
      WHERE p.verification_status = 'verified' AND p.status = 'active'
        AND p.city = ? AND JSON_CONTAINS(p.specialties, JSON_QUOTE(?))
      GROUP BY p.id, p.display_name, p.provider_type, p.city, p.address,
        p.specialties, p.services, p.accepting_referrals
      ORDER BY p.display_name LIMIT ? OFFSET ?`,
    [f.city, f.specialty, f.limit, f.offset],
  );
  return rows.map((r) => ({
    ...r,
    centres: (r.centre_names ?? '').split(', ').filter(Boolean),
  }));
}

// ---- operating centres ----
export async function listCentres(db: Db, providerId: number): Promise<ProviderCentre[]> {
  const [rows] = await db.execute<ProviderCentre[]>(
    `SELECT id, provider_id, name, address, city, phone, is_active, created_at, updated_at
       FROM provider_centres
      WHERE provider_id = ?
      ORDER BY name ASC, id ASC`,
    [providerId],
  );
  return rows;
}

export async function findCentre(db: Db, centreId: number): Promise<ProviderCentre | null> {
  const [rows] = await db.execute<ProviderCentre[]>(
    `SELECT id, provider_id, name, address, city, phone, is_active, created_at, updated_at
       FROM provider_centres
      WHERE id = ?`,
    [centreId],
  );
  return rows[0] ?? null;
}

export async function insertCentre(
  db: Db,
  providerId: number,
  centre: { name: string; address: string; city: string; phone: string | null },
): Promise<number> {
  const [r] = await db.execute<Result>(
    `INSERT INTO provider_centres(provider_id, name, address, city, phone)
     VALUES (?, ?, ?, ?, ?)`,
    [providerId, centre.name, centre.address, centre.city, centre.phone],
  );
  return r.insertId;
}

export async function updateCentre(
  db: Db,
  centreId: number,
  fields: Partial<{
    name: string;
    address: string;
    city: string;
    phone: string | null;
    is_active: boolean;
  }>,
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number | boolean | null)[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    sets.push(`${key} = ?`);
    params.push(value);
  }
  if (sets.length === 0) return;
  params.push(centreId);
  await db.execute(`UPDATE provider_centres SET ${sets.join(', ')} WHERE id = ?`, params);
}

// ---- centre schedules & slots ----

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

// ---- centre caregivers ----
export async function listCentreCaregivers(db: Db, centreId: number): Promise<Caregiver[]> {
  const [rows] = await db.execute<Caregiver[]>(
    `SELECT pc.user_id, u.full_name, pc.is_active
       FROM provider_caregivers pc JOIN users u ON u.id = pc.user_id
      WHERE pc.centre_id = ?
      ORDER BY pc.is_active DESC, u.full_name ASC`,
    [centreId],
  );
  return rows;
}

export async function findCentreCaregiver(db: Db, centreId: number, userId: number) {
  const [rows] = await db.execute<Row[]>(
    `SELECT id FROM provider_caregivers WHERE centre_id = ? AND user_id = ?`,
    [centreId, userId],
  );
  return rows[0];
}

export async function upsertCentreCaregiver(
  db: Db,
  centreId: number,
  providerId: number,
  userId: number,
  isActive: boolean,
) {
  await db.execute(
    `INSERT INTO provider_caregivers(provider_id, centre_id, user_id, is_active)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
    [providerId, centreId, userId, isActive ? 1 : 0],
  );
}

export async function findActiveCentreCaregiver(
  db: Db,
  centreId: number,
  userId: number,
): Promise<Row | null> {
  const [rows] = await db.execute<Row[]>(
    `SELECT pc.id FROM provider_caregivers pc
       JOIN provider_centres c ON c.id = pc.centre_id
      WHERE pc.centre_id = ? AND pc.user_id = ? AND pc.is_active = 1
        AND c.provider_id = (SELECT provider_id FROM provider_centres WHERE id = ?)`,
    [centreId, userId, centreId],
  );
  return rows[0] ?? null;
}
