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
    `INSERT INTO care_requests(patient_user_id, specialty, service_type, description, preferred_city,
       urgency, status, assigned_provider_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      r.patient_user_id,
      r.specialty,
      r.service_type,
      r.description,
      r.preferred_city,
      r.urgency,
      // Directed requests (the patient picked a clinic) are inserted `submitted` and moved to
      // `provider_accepted` by the service, so the state machine still owns the transition.
      'submitted',
      null,
    ],
  );
  return res.insertId;
}

export async function findById(db: Db, id: number, opts: { forUpdate?: boolean } = {}) {
  const [rows] = await db.execute<Row[]>(
    `SELECT cr.id, cr.patient_user_id, cr.specialty, cr.service_type, cr.description,
            cr.preferred_city, cr.urgency, cr.status, cr.assigned_provider_id,
            p.display_name AS assigned_provider, cr.created_at, cr.updated_at
       FROM care_requests cr LEFT JOIN providers p ON p.id = cr.assigned_provider_id
      WHERE cr.id = ?${opts.forUpdate ? ' FOR UPDATE' : ''}`,
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
