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
  },
) {
  const [r] = await db.execute<Result>(
    `INSERT INTO users(full_name, email, phone, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)`,
    [u.full_name, u.email, u.phone, u.password_hash, u.role, u.status],
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
    city: string;
    address: string;
    specialties: string[];
    services?: string[];
  },
) {
  const [r] = await db.execute<Result>(
    `INSERT INTO providers(legal_name, display_name, provider_type, registration_number,
       verification_status, status, city, address, specialties, services)
     VALUES (?, ?, ?, ?, 'pending', 'active', ?, ?, ?, ?)`,
    [
      p.legal_name,
      p.display_name,
      p.provider_type,
      p.registration_number,
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
