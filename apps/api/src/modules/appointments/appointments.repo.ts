import type { Db, Result, Row } from '../../db/pool.js';
import type { Pagination } from '../../lib/validate.js';

const FIELDS = `a.id, a.care_request_id, a.patient_user_id, u.full_name AS patient_name, a.provider_id,
  p.display_name AS provider, a.appointment_type, a.appointment_mode, a.centre_id,
  pc.name AS centre_name, pc.address_line AS centre_address, a.caregiver_id, cg.full_name AS caregiver_name,
  a.starts_at, a.ends_at, a.status, a.created_at`;
const FROM = `appointments a JOIN providers p ON p.id = a.provider_id JOIN users u ON u.id = a.patient_user_id
  LEFT JOIN provider_centres pc ON pc.id = a.centre_id LEFT JOIN provider_caregivers cg ON cg.id = a.caregiver_id`;

export async function insert(
  db: Db,
  a: {
    care_request_id: number;
    patient_user_id: number;
    provider_id: number;
    centre_id: number | null;
    caregiver_id: number | null;
    appointment_type: string;
    appointment_mode: string;
    starts_at: Date;
    ends_at: Date;
    status: string;
    created_by_user_id: number;
  },
) {
  const [r] = await db.execute<Result>(
    `INSERT INTO appointments(care_request_id, patient_user_id, provider_id, centre_id, caregiver_id,
       appointment_type, appointment_mode, starts_at, ends_at, status, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      a.care_request_id,
      a.patient_user_id,
      a.provider_id,
      a.centre_id,
      a.caregiver_id,
      a.appointment_type,
      a.appointment_mode,
      a.starts_at,
      a.ends_at,
      a.status,
      a.created_by_user_id,
    ],
  );
  return r.insertId;
}

/**
 * Update the provider on a requested appointment (patient picks a different provider
 * before the clinic confirms). Only allowed while status is `requested`.
 */
export async function countSeenForRequest(db: Db, careRequestId: number) {
  const [rows] = await db.execute<Row[]>(
    `SELECT COUNT(*) AS n FROM appointments
      WHERE care_request_id = ? AND status IN ('checked_in','completed')`,
    [careRequestId],
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Active (requested/booked/confirmed) appointments for a provider that overlap [start, end).
 * A `requested` appointment holds its slot until the provider confirms or declines.
 */
export async function findOverlapping(db: Db, providerId: number, start: Date, end: Date) {
  const [rows] = await db.execute<Row[]>(
    `SELECT id FROM appointments
      WHERE provider_id = ? AND status IN ('requested','booked','confirmed') AND starts_at < ? AND ends_at > ?`,
    [providerId, end, start],
  );
  return rows;
}

export async function findById(db: Db, id: number, opts: { forUpdate?: boolean } = {}) {
  const [rows] = await db.execute<Row[]>(
    `SELECT ${FIELDS} FROM ${FROM}
      WHERE a.id = ?${opts.forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0];
}

export async function list(
  db: Db,
  f: { patientId?: number; providerId?: number; providerIds?: number[] } & Pagination,
) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.patientId !== undefined) {
    where.push('a.patient_user_id = ?');
    params.push(f.patientId);
  }
  // One clinic (the switcher's choice, or an operator narrowing the diary).
  if (f.providerId !== undefined) {
    where.push('a.provider_id = ?');
    params.push(f.providerId);
  }
  if (f.providerIds !== undefined) {
    if (f.providerIds.length === 0) return [];
    where.push(`a.provider_id IN (${f.providerIds.map(() => '?').join(',')})`);
    params.push(...f.providerIds);
  }
  const [rows] = await db.query<Row[]>(
    `SELECT ${FIELDS} FROM ${FROM}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.starts_at ASC, a.id ASC LIMIT ? OFFSET ?`,
    [...params, f.limit, f.offset],
  );
  return rows;
}

export async function setStatus(db: Db, id: number, status: string) {
  await db.execute('UPDATE appointments SET status = ? WHERE id = ?', [status, id]);
}

export async function cancelActiveForRequest(db: Db, requestId: number) {
  const [r] = await db.execute<Result>(
    `UPDATE appointments SET status = 'cancelled' WHERE care_request_id = ? AND status IN ('requested','booked','confirmed')`,
    [requestId],
  );
  return r.affectedRows;
}

/** Is the caregiver an active member of that centre? */
export async function caregiverAtCentre(db: Db, caregiverId: number, centreId: number) {
  const [rows] = await db.execute<Row[]>(
    'SELECT id FROM provider_caregivers WHERE id = ? AND centre_id = ? AND is_active = TRUE',
    [caregiverId, centreId],
  );
  return rows.length > 0;
}

/** Bookings on a care request that are still to happen or happening. */
export async function countActiveForRequest(db: Db, careRequestId: number) {
  const [rows] = await db.execute<Row[]>(
    `SELECT COUNT(*) AS n FROM appointments
      WHERE care_request_id = ? AND status IN ('requested','booked','confirmed','checked_in')`,
    [careRequestId],
  );
  return Number(rows[0]!.n);
}

/** A patient's booking requests the clinic hasn't confirmed yet (locked). */
export async function requestedForPatient(db: Db, patientId: number) {
  const [rows] = await db.execute<Row[]>(
    `SELECT id, care_request_id FROM appointments WHERE patient_user_id = ? AND status = 'requested' FOR UPDATE`,
    [patientId],
  );
  return rows as { id: number; care_request_id: number }[];
}
