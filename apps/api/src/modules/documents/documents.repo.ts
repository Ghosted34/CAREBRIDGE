import type { Db, Result, Row } from '../../db/pool.js';

export interface DocumentRow extends Row {
  id: number;
  care_request_id: number;
  uploader_user_id: number;
  uploader_name: string;
  document_type: 'photo' | 'xray' | 'report' | 'referral' | 'other';
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  storage_key: string;
  created_at: string;
}

const FIELDS = `d.id, d.care_request_id, d.uploader_user_id, u.full_name AS uploader_name,
  d.document_type, d.file_name, d.mime_type, d.file_size_bytes, d.storage_key, d.created_at`;
const FROM = `clinical_documents d JOIN users u ON u.id = d.uploader_user_id`;

export async function insert(
  db: Db,
  d: {
    care_request_id: number;
    uploader_user_id: number;
    document_type: string;
    file_name: string;
    mime_type: string;
    file_size_bytes: number;
    storage_key: string;
  },
): Promise<number> {
  const [res] = await db.execute<Result>(
    `INSERT INTO clinical_documents (care_request_id, uploader_user_id, document_type,
       file_name, mime_type, file_size_bytes, storage_key)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      d.care_request_id,
      d.uploader_user_id,
      d.document_type,
      d.file_name,
      d.mime_type,
      d.file_size_bytes,
      d.storage_key,
    ],
  );
  return res.insertId;
}

export async function findById(db: Db, id: number): Promise<DocumentRow | null> {
  const [rows] = await db.execute<DocumentRow[]>(`SELECT ${FIELDS} FROM ${FROM} WHERE d.id = ?`, [
    id,
  ]);
  return rows[0] ?? null;
}

export async function findByRequest(db: Db, careRequestId: number): Promise<DocumentRow[]> {
  const [rows] = await db.execute<DocumentRow[]>(
    `SELECT ${FIELDS} FROM ${FROM} WHERE d.care_request_id = ? ORDER BY d.created_at DESC`,
    [careRequestId],
  );
  return rows;
}
