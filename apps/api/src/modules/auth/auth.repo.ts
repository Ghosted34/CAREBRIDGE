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
