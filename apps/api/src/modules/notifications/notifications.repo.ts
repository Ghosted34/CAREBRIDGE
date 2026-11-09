import type { Db, Result, Row } from '../../db/pool.js';
import type { Pagination } from '../../lib/validate.js';

export async function insert(
  db: Db,
  n: {
    user_id: number;
    channel: string;
    template_key: string;
    payload: object;
    status: 'queued' | 'sent';
  },
) {
  const [r] = await db.execute<Result>(
    `INSERT INTO notifications(user_id, channel, template_key, payload, status, sent_at)
     VALUES (?, ?, ?, ?, ?, IF(? = 'sent', UTC_TIMESTAMP(), NULL))`,
    [n.user_id, n.channel, n.template_key, JSON.stringify(n.payload), n.status, n.status],
  );
  return r.insertId;
}

export async function inbox(db: Db, userId: number, f: { unreadOnly: boolean } & Pagination) {
  const [rows] = await db.query<Row[]>(
    `SELECT id, template_key, payload, read_at, created_at FROM notifications
      WHERE user_id = ? AND channel = 'in_app' ${f.unreadOnly ? 'AND read_at IS NULL' : ''}
      ORDER BY id DESC LIMIT ? OFFSET ?`,
    [userId, f.limit, f.offset],
  );
  return rows;
}

export async function unreadCount(db: Db, userId: number) {
  const [rows] = await db.execute<Row[]>(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND channel = 'in_app' AND read_at IS NULL`,
    [userId],
  );
  return Number(rows[0]!.n);
}

export async function markRead(db: Db, userId: number, id: number) {
  const [r] = await db.execute<Result>(
    `UPDATE notifications SET read_at = COALESCE(read_at, UTC_TIMESTAMP())
      WHERE id = ? AND user_id = ? AND channel = 'in_app'`,
    [id, userId],
  );
  return r.affectedRows;
}

export async function markAllRead(db: Db, userId: number) {
  const [r] = await db.execute<Result>(
    `UPDATE notifications SET read_at = UTC_TIMESTAMP()
      WHERE user_id = ? AND channel = 'in_app' AND read_at IS NULL`,
    [userId],
  );
  return r.affectedRows;
}

/** Due outbound messages, locked; SKIP LOCKED lets several workers run without sending twice. */
export async function claimDue(db: Db, limit: number) {
  const [rows] = await db.query<Row[]>(
    `SELECT n.id, n.user_id, n.channel, n.template_key, n.payload, n.attempts, u.email, u.phone, u.status AS user_status
       FROM notifications n JOIN users u ON u.id = n.user_id
      WHERE n.status = 'queued' AND n.channel IN ('sms','email')
        AND (n.next_attempt_at IS NULL OR n.next_attempt_at <= UTC_TIMESTAMP())
      ORDER BY n.id LIMIT ? FOR UPDATE OF n SKIP LOCKED`,
    [limit],
  );
  return rows;
}

export async function markSent(
  db: Db,
  id: number,
  provider: string,
  providerMessageId: string | null,
) {
  await db.execute(
    `UPDATE notifications
        SET status = 'sent', sent_at = UTC_TIMESTAMP(), attempts = attempts + 1, last_error = NULL,
            provider = ?, provider_message_id = ?
      WHERE id = ?`,
    [provider, providerMessageId, id],
  );
}

export async function markSkipped(db: Db, id: number, reason: string) {
  await db.execute(`UPDATE notifications SET status = 'skipped', last_error = ? WHERE id = ?`, [
    reason.slice(0, 500),
    id,
  ]);
}

/** Record a failed attempt: retry after `retryInMinutes`, or give up (`failed`) when null. */
export async function markAttemptFailed(
  db: Db,
  id: number,
  provider: string,
  error: string,
  retryInMinutes: number | null,
) {
  await db.execute(
    `UPDATE notifications
        SET attempts = attempts + 1, last_error = ?, provider = ?,
            status = IF(? IS NULL, 'failed', 'queued'),
            next_attempt_at = IF(? IS NULL, NULL, UTC_TIMESTAMP() + INTERVAL ? MINUTE)
      WHERE id = ?`,
    [error.slice(0, 500), provider, retryInMinutes, retryInMinutes, retryInMinutes ?? 0, id],
  );
}
