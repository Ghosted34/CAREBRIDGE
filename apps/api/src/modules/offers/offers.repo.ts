import type { Db, Result, Row } from '../../db/pool.js';
import type { Pagination } from '../../lib/validate.js';

export async function insert(
  db: Db,
  o: {
    care_request_id: number;
    provider_id: number;
    offered_by_user_id: number;
    message: string | null;
  },
) {
  const [r] = await db.execute<Result>(
    `INSERT INTO provider_offers(care_request_id, provider_id, offered_by_user_id, message, status)
     VALUES (?, ?, ?, ?, 'offered')`,
    [o.care_request_id, o.provider_id, o.offered_by_user_id, o.message],
  );
  return r.insertId;
}

export async function findById(db: Db, id: number, opts: { forUpdate?: boolean } = {}) {
  const [rows] = await db.execute<Row[]>(
    `SELECT id, care_request_id, provider_id, offered_by_user_id, message, status, offered_at, responded_at
       FROM provider_offers WHERE id = ?${opts.forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0];
}

export async function listForRequest(db: Db, requestId: number) {
  const [rows] = await db.execute<Row[]>(
    `SELECT o.id, o.provider_id, p.display_name AS provider, p.address AS provider_address,
            o.message, o.status, o.offered_at, o.responded_at
       FROM provider_offers o JOIN providers p ON p.id = o.provider_id
      WHERE o.care_request_id = ? ORDER BY o.offered_at ASC, o.id ASC`,
    [requestId],
  );
  return rows;
}

export async function setStatus(db: Db, id: number, status: string) {
  await db.execute(
    'UPDATE provider_offers SET status = ?, responded_at = UTC_TIMESTAMP() WHERE id = ?',
    [status, id],
  );
}

/** Expire every still-open offer on a request (optionally except one). Returns how many. */
export async function expireOpenForRequest(db: Db, requestId: number, exceptOfferId?: number) {
  const [r] = await db.execute<Result>(
    `UPDATE provider_offers SET status = 'expired', responded_at = UTC_TIMESTAMP()
      WHERE care_request_id = ? AND status = 'offered' AND id <> ?`,
    [requestId, exceptOfferId ?? 0],
  );
  return r.affectedRows;
}

/**
 * Offers made by the given providers (null = all), newest first, with request summary.
 * `providerId` narrows to one clinic (the multi-clinic switcher); it wins over the list.
 */
export async function listForProviders(
  db: Db,
  providerIds: number[] | null,
  page: Pagination,
  providerId?: number,
) {
  if (providerId === undefined && providerIds && providerIds.length === 0) return [];
  const ids = providerId !== undefined ? [providerId] : providerIds;
  const where = ids ? `WHERE o.provider_id IN (${ids.map(() => '?').join(',')})` : '';
  const [rows] = await db.query<Row[]>(
    `SELECT o.id, o.care_request_id, o.provider_id, p.display_name AS provider, o.message, o.status,
            o.offered_at, o.responded_at, cr.specialty, cr.service_type, cr.urgency,
            cr.status AS request_status
       FROM provider_offers o
       JOIN providers p ON p.id = o.provider_id
       JOIN care_requests cr ON cr.id = o.care_request_id
       ${where}
      ORDER BY o.offered_at DESC, o.id DESC LIMIT ? OFFSET ?`,
    [...(ids ?? []), page.limit, page.offset],
  );
  return rows;
}
