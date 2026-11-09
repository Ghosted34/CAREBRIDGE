import type { Db, Result, Row } from '../../db/pool.js';

export interface ConsentRow {
  consent_type: string;
  version: string;
  granted: boolean;
  recorded_at: Date;
}

/** Latest decision per consent type for a user. */
export async function latestForUser(db: Db, userId: number): Promise<ConsentRow[]> {
  const [rows] = await db.execute<Row[]>(
    `SELECT c.consent_type, c.version, c.granted, c.recorded_at
       FROM user_consents c
       JOIN (SELECT consent_type, MAX(id) AS id FROM user_consents WHERE user_id = ? GROUP BY consent_type) latest
         ON latest.id = c.id`,
    [userId],
  );
  return rows as ConsentRow[];
}

export async function insert(
  db: Db,
  c: {
    user_id: number;
    consent_type: string;
    version: string;
    granted: boolean;
    source: string;
    ip: string | null;
  },
) {
  const [r] = await db.execute<Result>(
    `INSERT INTO user_consents(user_id, consent_type, version, granted, source, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [c.user_id, c.consent_type, c.version, c.granted, c.source, c.ip],
  );
  return r.insertId;
}

/** Mark the user's still-active grants of a type as revoked (keeps the history queryable). */
export async function markRevoked(db: Db, userId: number, type: string) {
  await db.execute(
    `UPDATE user_consents SET revoked_at = UTC_TIMESTAMP()
      WHERE user_id = ? AND consent_type = ? AND granted = TRUE AND revoked_at IS NULL`,
    [userId, type],
  );
}
