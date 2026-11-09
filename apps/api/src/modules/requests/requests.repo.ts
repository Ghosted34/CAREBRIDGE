import type { Db, Result, Row } from '../../db/pool.js';
import type { Pagination } from '../../lib/validate.js';

export async function insert(
  db: Db,
  r: {
    patient_user_id: number;
    specialty: string;
    service_type: string;
    description: string;
    preferred_city: string;
    urgency: string;
  },
) {
  const [res] = await db.execute<Result>(
    `INSERT INTO care_requests(patient_user_id, specialty, service_type, description, preferred_city, urgency, status)
     VALUES (?, ?, ?, ?, ?, ?, 'submitted')`,
    [r.patient_user_id, r.specialty, r.service_type, r.description, r.preferred_city, r.urgency],
  );
  return res.insertId;
}

export async function findById(db: Db, id: number, opts: { forUpdate?: boolean } = {}) {
  const [rows] = await db.execute<Row[]>(
    `SELECT id, patient_user_id, specialty, service_type, description, preferred_city, urgency,
            status, assigned_provider_id, created_at, updated_at
       FROM care_requests WHERE id = ?${opts.forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0];
}

export async function listForPatient(db: Db, patientId: number, page: Pagination) {
  const [rows] = await db.query<Row[]>(
    `SELECT cr.id, cr.specialty, cr.service_type, cr.preferred_city, cr.urgency, cr.status,
            cr.assigned_provider_id, p.display_name AS assigned_provider, cr.created_at
       FROM care_requests cr LEFT JOIN providers p ON p.id = cr.assigned_provider_id
      WHERE cr.patient_user_id = ? ORDER BY cr.created_at DESC, cr.id DESC LIMIT ? OFFSET ?`,
    [patientId, page.limit, page.offset],
  );
  return rows;
}

/**
 * Open requests, most urgent first. When `providerIds` is given, only requests whose
 * specialty one of those providers offers (and in the same city) are returned.
 */
export async function listQueue(
  db: Db,
  f: { providerIds: number[] | null; specialty?: string } & Pagination,
) {
  const where = [`cr.status IN ('submitted','matching')`];
  const params: unknown[] = [];
  if (f.specialty) {
    where.push('cr.specialty = ?');
    params.push(f.specialty);
  }
  if (f.providerIds) {
    if (f.providerIds.length === 0) return [];
    where.push(`EXISTS (SELECT 1 FROM providers p
       WHERE p.id IN (${f.providerIds.map(() => '?').join(',')})
         AND p.city = cr.preferred_city AND p.accepting_referrals = TRUE
         AND JSON_CONTAINS(p.specialties, JSON_QUOTE(cr.specialty)))`);
    params.push(...f.providerIds);
  }
  const [rows] = await db.query<Row[]>(
    `SELECT cr.id, cr.specialty, cr.service_type, cr.description, cr.preferred_city,
            cr.urgency, cr.status, cr.created_at
       FROM care_requests cr WHERE ${where.join(' AND ')}
      ORDER BY FIELD(cr.urgency,'urgent','soon','routine'), cr.created_at ASC, cr.id ASC
      LIMIT ? OFFSET ?`,
    [...params, f.limit, f.offset],
  );
  return rows;
}

export async function setStatus(db: Db, id: number, status: string, assignedProviderId?: number) {
  if (assignedProviderId !== undefined) {
    await db.execute('UPDATE care_requests SET status = ?, assigned_provider_id = ? WHERE id = ?', [
      status,
      assignedProviderId,
      id,
    ]);
  } else {
    await db.execute('UPDATE care_requests SET status = ? WHERE id = ?', [status, id]);
  }
}

/** Provider IDs that have offered on this request (any status). */
export async function offeringProviderIds(db: Db, requestId: number) {
  const [rows] = await db.execute<Row[]>(
    'SELECT provider_id FROM provider_offers WHERE care_request_id = ?',
    [requestId],
  );
  return rows.map((r) => r.provider_id as number);
}

/** Requests assigned to the given providers (null = all), with patient contact for coordination. */
export async function listAssigned(
  db: Db,
  f: { providerIds: number[] | null; status?: string } & Pagination,
) {
  const where = ['cr.assigned_provider_id IS NOT NULL'];
  const params: unknown[] = [];
  if (f.status) {
    where.push('cr.status = ?');
    params.push(f.status);
  }
  if (f.providerIds) {
    if (f.providerIds.length === 0) return [];
    where.push(`cr.assigned_provider_id IN (${f.providerIds.map(() => '?').join(',')})`);
    params.push(...f.providerIds);
  }
  const [rows] = await db.query<Row[]>(
    `SELECT cr.id, cr.specialty, cr.service_type, cr.description, cr.preferred_city, cr.urgency,
            cr.status, cr.assigned_provider_id, p.display_name AS assigned_provider,
            u.full_name AS patient_name, u.phone AS patient_phone, cr.created_at, cr.updated_at
       FROM care_requests cr
       JOIN providers p ON p.id = cr.assigned_provider_id
       JOIN users u ON u.id = cr.patient_user_id
      WHERE ${where.join(' AND ')}
      ORDER BY cr.updated_at DESC, cr.id DESC LIMIT ? OFFSET ?`,
    [...params, f.limit, f.offset],
  );
  return rows;
}

/** IDs of a patient's requests still waiting for a provider (submitted/matching), locked for update. */
export async function openIdsForPatient(db: Db, patientId: number) {
  const [rows] = await db.execute<Row[]>(
    `SELECT id FROM care_requests
      WHERE patient_user_id = ? AND status IN ('submitted','matching') FOR UPDATE`,
    [patientId],
  );
  return rows.map((r) => r.id as number);
}

/** Verified, active providers that would see this request in their queue (same city, offers the specialty). */
export async function matchingProviders(db: Db, requestId: number) {
  const [rows] = await db.execute<Row[]>(
    `SELECT p.id, p.display_name FROM providers p JOIN care_requests cr ON cr.id = ?
      WHERE p.verification_status = 'verified' AND p.status = 'active' AND p.accepting_referrals = TRUE
        AND p.city = cr.preferred_city AND JSON_CONTAINS(p.specialties, JSON_QUOTE(cr.specialty))`,
    [requestId],
  );
  return rows.map((r) => ({ id: r.id as number, name: r.display_name as string }));
}

/** Providers with an unanswered offer on the request. */
export async function openOfferProviderIds(db: Db, requestId: number) {
  const [rows] = await db.execute<Row[]>(
    `SELECT provider_id FROM provider_offers WHERE care_request_id = ? AND status = 'offered'`,
    [requestId],
  );
  return rows.map((r) => r.provider_id as number);
}
