import type { Db, Result, Row } from '../../db/pool.js';

const FIELDS = `n.id, n.appointment_id, n.note_type, n.notes, n.created_by_user_id,
  u.full_name AS created_by_name, n.created_at, n.updated_at`;
const FROM = `appointment_notes n JOIN users u ON u.id = n.created_by_user_id`;

export async function insert(
  db: Db,
  n: {
    appointment_id: number;
    note_type: string;
    notes: string;
    created_by_user_id: number;
  },
) {
  const [r] = await db.execute<Result>(
    `INSERT INTO appointment_notes(appointment_id, note_type, notes, created_by_user_id)
     VALUES (?, ?, ?, ?)`,
    [n.appointment_id, n.note_type, n.notes, n.created_by_user_id],
  );
  return r.insertId;
}

export async function findById(db: Db, id: number): Promise<Row | null> {
  const [rows] = await db.execute<Row[]>(`SELECT ${FIELDS} FROM ${FROM} WHERE n.id = ?`, [id]);
  return rows[0] ?? null;
}

export async function listByAppointment(db: Db, appointmentId: number) {
  const [rows] = await db.execute<Row[]>(
    `SELECT ${FIELDS} FROM ${FROM}
      WHERE n.appointment_id = ?
      ORDER BY n.created_at ASC, n.id ASC`,
    [appointmentId],
  );
  return rows;
}
