import type { Db, Result, Row } from '../../db/pool.js';
import type { z } from 'zod';
import type { Pagination } from '../../lib/validate.js';
import type { CreateProviderBody } from './admin.schema.js';

export async function metrics(db: Db) {
  const [rows] = await db.query<Row[]>(`SELECT
    (SELECT COUNT(*) FROM users WHERE role = 'patient') AS patients,
    (SELECT COUNT(*) FROM users WHERE role = 'provider_staff' AND status = 'pending') AS pending_provider_staff,
    (SELECT COUNT(*) FROM providers WHERE verification_status = 'verified') AS verified_providers,
    (SELECT COUNT(*) FROM providers WHERE verification_status = 'pending') AS pending_providers,
    (SELECT COUNT(*) FROM care_requests) AS care_requests,
    (SELECT COUNT(*) FROM care_requests WHERE status IN ('submitted','matching')) AS open_care_requests,
    (SELECT COUNT(*) FROM appointments) AS appointments`);
  return rows[0];
}

export async function listUsers(db: Db, f: { status?: string; role?: string } & Pagination) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.status) {
    where.push('status = ?');
    params.push(f.status);
  }
  if (f.role) {
    where.push('role = ?');
    params.push(f.role);
  }
  const [rows] = await db.query<Row[]>(
    `SELECT id, full_name, email, phone, role, status, created_at FROM users
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, f.limit, f.offset],
  );
  return rows;
}

export async function findUser(db: Db, id: number) {
  const [rows] = await db.execute<Row[]>('SELECT id, role, status FROM users WHERE id = ?', [id]);
  return rows[0];
}

export async function setUserStatus(db: Db, id: number, status: string) {
  await db.execute('UPDATE users SET status = ? WHERE id = ?', [status, id]);
}

export async function insertProvider(db: Db, p: z.infer<typeof CreateProviderBody>) {
  const [r] = await db.execute<Result>(
    `INSERT INTO providers(legal_name, display_name, provider_type, registration_number,
       verification_status, status, city, address, latitude, longitude, specialties, services)
     VALUES (?, ?, ?, ?, 'pending', 'active', ?, ?, ?, ?, ?, ?)`,
    [
      p.legal_name,
      p.display_name,
      p.provider_type,
      p.registration_number,
      p.city,
      p.address,
      p.latitude ?? null,
      p.longitude ?? null,
      JSON.stringify(p.specialties),
      p.services ? JSON.stringify(p.services) : null,
    ],
  );
  return r.insertId;
}

export async function findProvider(db: Db, id: number) {
  const [rows] = await db.execute<Row[]>(
    'SELECT id, verification_status, status FROM providers WHERE id = ?',
    [id],
  );
  return rows[0];
}

export async function setVerification(db: Db, id: number, status: string) {
  await db.execute('UPDATE providers SET verification_status = ? WHERE id = ?', [status, id]);
}

/** Owners of a facility whose accounts still await approval (a clinic self-registration). */
export async function pendingOwnerIds(db: Db, providerId: number): Promise<number[]> {
  const [rows] = await db.execute<Row[]>(
    `SELECT u.id FROM provider_users pu JOIN users u ON u.id = pu.user_id
      WHERE pu.provider_id = ? AND pu.provider_role = 'owner' AND u.status = 'pending'`,
    [providerId],
  );
  return rows.map((r) => Number(r.id));
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

export async function listProviders(db: Db, f: { verification_status?: string } & Pagination) {
  const where = f.verification_status ? 'WHERE p.verification_status = ?' : '';
  const [rows] = await db.query<Row[]>(
    `SELECT p.id, p.legal_name, p.display_name, p.provider_type, p.registration_number, p.cac_number, p.tax_id,
            p.verification_status, p.status, p.city, p.address, p.specialties, p.accepting_referrals,
            p.created_at, (SELECT COUNT(*) FROM provider_users pu WHERE pu.provider_id = p.id) AS member_count
       FROM providers p ${where}
      ORDER BY FIELD(p.verification_status,'pending','verified','suspended','rejected'), p.display_name
      LIMIT ? OFFSET ?`,
    [...(f.verification_status ? [f.verification_status] : []), f.limit, f.offset],
  );
  return rows;
}

export async function listMembers(db: Db, providerId: number) {
  const [rows] = await db.execute<Row[]>(
    `SELECT u.id AS user_id, u.full_name, u.email, u.status, pu.provider_role, pu.created_at
       FROM provider_users pu JOIN users u ON u.id = pu.user_id
      WHERE pu.provider_id = ? ORDER BY u.full_name`,
    [providerId],
  );
  return rows;
}

export async function listAuditLogs(
  db: Db,
  f: {
    action?: string;
    entity_type?: string;
    entity_id?: number;
    actor_user_id?: number;
  } & Pagination,
) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.action) {
    where.push('a.action = ?');
    params.push(f.action);
  }
  if (f.entity_type) {
    where.push('a.entity_type = ?');
    params.push(f.entity_type);
  }
  if (f.entity_id) {
    where.push('a.entity_id = ?');
    params.push(f.entity_id);
  }
  if (f.actor_user_id) {
    where.push('a.actor_user_id = ?');
    params.push(f.actor_user_id);
  }
  const [rows] = await db.query<Row[]>(
    `SELECT a.id, a.actor_user_id, u.full_name AS actor_name, u.email AS actor_email,
            a.action, a.entity_type, a.entity_id, a.ip_address, a.metadata, a.created_at
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`,
    [...params, f.limit, f.offset],
  );
  return rows;
}

/**
 * Work that is waiting too long (pilot KPI: clinics acknowledge booking requests within 2 hours).
 *  - request_unconfirmed: a booking request the clinic hasn't confirmed or declined (warning 1h, breach 2h)
 *  - visit_not_recorded: a confirmed visit whose time passed 2h ago with no check-in or no-show
 *  - notes_missing: checked in over 24h ago and still not closed with notes
 */
export async function listStuckRequests(db: Db) {
  const [rows] = await db.query<Row[]>(
    `SELECT a.id AS appointment_id, a.care_request_id AS id, a.patient_user_id, u.full_name AS patient_name,
            a.status, a.starts_at, p.display_name AS assigned_provider, a.provider_id AS assigned_provider_id,
            pc.name AS centre_name, a.created_at,
            TIMESTAMPDIFF(MINUTE, a.created_at, UTC_TIMESTAMP()) AS age_minutes,
            CASE
              WHEN a.status = 'requested' AND TIMESTAMPDIFF(MINUTE, a.created_at, UTC_TIMESTAMP()) >= 120 THEN 'request_unconfirmed_breach'
              WHEN a.status = 'requested' THEN 'request_unconfirmed_warning'
              WHEN a.status = 'confirmed' THEN 'visit_not_recorded'
              ELSE 'notes_missing'
            END AS sla_category
       FROM appointments a
       JOIN users u ON u.id = a.patient_user_id
       JOIN providers p ON p.id = a.provider_id
       LEFT JOIN provider_centres pc ON pc.id = a.centre_id
      WHERE (a.status = 'requested' AND TIMESTAMPDIFF(MINUTE, a.created_at, UTC_TIMESTAMP()) >= 60)
         OR (a.status = 'confirmed' AND a.ends_at < UTC_TIMESTAMP() - INTERVAL 2 HOUR)
         OR (a.status = 'checked_in' AND a.updated_at < UTC_TIMESTAMP() - INTERVAL 24 HOUR)
      ORDER BY a.created_at ASC`,
  );
  return rows;
}
