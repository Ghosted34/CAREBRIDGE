import type { Db, Result, Row } from '../../db/pool.js';
import type { Pagination } from '../../lib/validate.js';

const FIELDS = `n.id, n.appointment_id, n.author_user_id, u.full_name AS author_name, n.note_type,
  n.summary, n.created_at`;

export async function insert(
  db: Db,
  appointmentId: number,
  authorUserId: number,
  noteType: string,
  summary: string,
): Promise<number> {
  const [r] = await db.execute<Result>(
    `INSERT INTO appointment_notes(appointment_id, author_user_id, note_type, summary)
     VALUES (?, ?, ?, ?)`,
    [appointmentId, authorUserId, noteType, summary],
  );
  return r.insertId;
}

export async function findByAppointment(
  db: Db,
  appointmentId: number,
  page: Pagination,
): Promise<Row[]> {
  const [rows] = await db.query<Row[]>(
    `SELECT ${FIELDS} FROM appointment_notes n
       JOIN users u ON u.id = n.author_user_id
      WHERE n.appointment_id = ?
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?`,
    [appointmentId, page.limit, page.offset],
  );
  return rows;
}

export async function countByAppointment(db: Db, appointmentId: number): Promise<number> {
  const [rows] = await db.execute<Row[]>(
    `SELECT COUNT(*) AS n FROM appointment_notes WHERE appointment_id = ?`,
    [appointmentId],
  );
  return Number(rows[0]?.n ?? 0);
}
