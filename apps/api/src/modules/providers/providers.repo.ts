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

// ---- operating centres ----

export async function findCentre(db: Db, centreId: number) {
  const [rows] = await db.execute<Row[]>(
    `SELECT id, provider_id, name, address_line, city, state, postal_code, phone, latitude, longitude, is_active
       FROM provider_centres
      WHERE id = ?`,
    [centreId],
  );
  return rows[0];
}

export async function listCentres(db: Db, providerId: number) {
  const [rows] = await db.execute<Row[]>(
    `SELECT id, provider_id, name, address_line, city, state, postal_code, phone, latitude, longitude, is_active
       FROM provider_centres
      WHERE provider_id = ?
      ORDER BY name ASC`,
    [providerId],
  );
  return rows;
}

export async function insertCentre(
  db: Db,
  providerId: number,
  centre: {
    name: string;
    address_line: string;
    city: string;
    state: string;
    postal_code: string;
    phone: string | null;
    latitude: number | null;
    longitude: number | null;
  },
): Promise<number> {
  const [r] = await db.execute<Result>(
    `INSERT INTO provider_centres (provider_id, name, address_line, city, state, postal_code, phone, latitude, longitude)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      providerId,
      centre.name,
      centre.address_line,
      centre.city,
      centre.state,
      centre.postal_code,
      centre.phone,
      centre.latitude,
      centre.longitude,
    ],
  );
  return r.insertId;
}

export async function updateCentre(
  db: Db,
  centreId: number,
  providerId: number,
  changes: {
    name?: string;
    address_line?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    phone?: string | null;
    is_active?: boolean;
  },
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (changes.name !== undefined) {
    sets.push('name = ?');
    params.push(changes.name);
  }
  if (changes.address_line !== undefined) {
    sets.push('address_line = ?');
    params.push(changes.address_line);
  }
  if (changes.city !== undefined) {
    sets.push('city = ?');
    params.push(changes.city);
  }
  if (changes.state !== undefined) {
    sets.push('state = ?');
    params.push(changes.state);
  }
  if (changes.postal_code !== undefined) {
    sets.push('postal_code = ?');
    params.push(changes.postal_code);
  }
  if (changes.phone !== undefined) {
    sets.push('phone = ?');
    params.push(changes.phone);
  }
  if (changes.is_active !== undefined) {
    sets.push('is_active = ?');
    params.push(changes.is_active ? 1 : 0);
  }
  if (sets.length === 0) return;
  params.push(centreId, providerId);
  await db.execute(
    `UPDATE provider_centres SET ${sets.join(', ')} WHERE id = ? AND provider_id = ?`,
    params,
  );
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

// ---- caregivers ----

export async function listCaregivers(db: Db, providerId: number) {
  const [rows] = await db.execute<Row[]>(
    `SELECT c.id, c.provider_id, c.centre_id, c.full_name, c.role, c.is_active,
            ce.name AS centre_name
       FROM provider_caregivers c
       JOIN provider_centres ce ON ce.id = c.centre_id
      WHERE c.provider_id = ?
      ORDER BY ce.name ASC, c.full_name ASC`,
    [providerId],
  );
  return rows;
}

export async function insertCaregiver(
  db: Db,
  providerId: number,
  centreId: number,
  fullName: string,
  role: string,
): Promise<number> {
  const [r] = await db.execute<Result>(
    `INSERT INTO provider_caregivers (provider_id, centre_id, full_name, role)
     VALUES (?, ?, ?, ?)`,
    [providerId, centreId, fullName, role],
  );
  return r.insertId;
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
