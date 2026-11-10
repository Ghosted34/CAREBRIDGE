import type { Db, Result, Row } from '../../db/pool.js';

export async function insertUser(
  db: Db,
  u: {
    full_name: string;
    email: string;
    phone: string;
    password_hash: string;
    role: string;
    status: string;
    address_street?: string | null;
    address_city?: string | null;
    address_state?: string | null;
    address_postal?: string | null;
    date_of_birth?: string | null;
    gender?: string | null;
    id_number?: string | null;
    emergency_contact_name?: string | null;
    emergency_contact_phone?: string | null;
  },
) {
  const [r] = await db.execute<Result>(
    `INSERT INTO users(full_name, email, phone, password_hash, role, status,
       address_street, address_city, address_state, address_postal,
       date_of_birth, gender, id_number, emergency_contact_name, emergency_contact_phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      u.full_name,
      u.email,
      u.phone,
      u.password_hash,
      u.role,
      u.status,
      u.address_street ?? null,
      u.address_city ?? null,
      u.address_state ?? null,
      u.address_postal ?? null,
      u.date_of_birth ?? null,
      u.gender ?? null,
      u.id_number ?? null,
      u.emergency_contact_name ?? null,
      u.emergency_contact_phone ?? null,
    ],
  );
  return r.insertId;
}

/** A clinic registering itself at sign-up: always `pending` until CareBridge verifies it. */
export async function insertPendingProvider(
  db: Db,
  p: {
    legal_name: string;
    display_name: string;
    provider_type: string;
    registration_number: string;
    cac_number: string;
    tax_id: string;
    city: string;
    address: string;
    specialties: string[];
    services?: string[];
  },
) {
  const [r] = await db.execute<Result>(
    `INSERT INTO providers(legal_name, display_name, provider_type, registration_number,
       cac_number, tax_id, verification_status, status, city, address, specialties, services)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 'active', ?, ?, ?, ?)`,
    [
      p.legal_name,
      p.display_name,
      p.provider_type,
      p.registration_number,
      p.cac_number,
      p.tax_id,
      p.city,
      p.address,
      JSON.stringify(p.specialties),
      p.services ? JSON.stringify(p.services) : null,
    ],
  );
  return r.insertId;
}

export async function insertMembership(db: Db, providerId: number, userId: number, role: string) {
  await db.execute(
    'INSERT INTO provider_users(provider_id, user_id, provider_role) VALUES (?, ?, ?)',
    [providerId, userId, role],
  );
}

export async function findUserByEmail(db: Db, email: string) {
  const [rows] = await db.execute<Row[]>(
    'SELECT id, full_name, email, password_hash, role, status FROM users WHERE email = ?',
    [email],
  );
  return rows[0];
}

export async function findProfile(db: Db, id: number) {
  const [rows] = await db.execute<Row[]>(
    'SELECT id, full_name, email, phone, role, status, created_at FROM users WHERE id = ?',
    [id],
  );
  return rows[0];
}

export async function findMemberships(db: Db, userId: number) {
  const [rows] = await db.execute<Row[]>(
    `SELECT p.id AS provider_id, p.display_name, p.verification_status, pu.provider_role
       FROM provider_users pu JOIN providers p ON p.id = pu.provider_id
      WHERE pu.user_id = ? ORDER BY p.display_name`,
    [userId],
  );
  return rows;
}
