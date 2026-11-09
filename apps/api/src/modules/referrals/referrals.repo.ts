import type { Db, Result, Row } from '../../db/pool.js';

export interface ReferralRow extends Row {
  id: number;
  care_request_id: number;
  referring_provider_id: number;
  referring_provider: string;
  receiving_provider_id: number;
  receiving_provider: string;
  referred_specialty: string;
  clinical_summary: string;
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'completed' | 'cancelled';
  created_at: string;
}

const FIELDS = `r.id, r.care_request_id, r.referring_provider_id, p1.display_name AS referring_provider,
  r.receiving_provider_id, p2.display_name AS receiving_provider, r.referred_specialty,
  r.clinical_summary, r.status, r.created_at`;
const FROM = `clinical_referrals r
  JOIN providers p1 ON p1.id = r.referring_provider_id
  JOIN providers p2 ON p2.id = r.receiving_provider_id`;

export async function insert(
  db: Db,
  r: {
    care_request_id: number;
    referring_provider_id: number;
    receiving_provider_id: number;
    referred_specialty: string;
    clinical_summary: string;
    status: string;
  },
): Promise<number> {
  const [res] = await db.execute<Result>(
    `INSERT INTO clinical_referrals (care_request_id, referring_provider_id, receiving_provider_id,
       referred_specialty, clinical_summary, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      r.care_request_id,
      r.referring_provider_id,
      r.receiving_provider_id,
      r.referred_specialty,
      r.clinical_summary,
      r.status,
    ],
  );
  return res.insertId;
}

export async function findById(
  db: Db,
  id: number,
  opts: { forUpdate?: boolean } = {},
): Promise<ReferralRow | null> {
  const [rows] = await db.execute<ReferralRow[]>(
    `SELECT ${FIELDS} FROM ${FROM} WHERE r.id = ?${opts.forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findByRequest(db: Db, careRequestId: number): Promise<ReferralRow[]> {
  const [rows] = await db.execute<ReferralRow[]>(
    `SELECT ${FIELDS} FROM ${FROM} WHERE r.care_request_id = ? ORDER BY r.created_at DESC`,
    [careRequestId],
  );
  return rows;
}

export async function findForProviders(
  db: Db,
  providerIds: number[],
  type: 'incoming' | 'outgoing' | 'all',
  status?: string,
): Promise<ReferralRow[]> {
  if (!providerIds.length) return [];
  const placeholders = providerIds.map(() => '?').join(',');
  const params: (string | number)[] = [];
  let where: string;
  if (type === 'incoming') {
    where = `r.receiving_provider_id IN (${placeholders})`;
    params.push(...providerIds);
  } else if (type === 'outgoing') {
    where = `r.referring_provider_id IN (${placeholders})`;
    params.push(...providerIds);
  } else {
    where = `(r.receiving_provider_id IN (${placeholders}) OR r.referring_provider_id IN (${placeholders}))`;
    params.push(...providerIds, ...providerIds);
  }

  if (status) {
    where += ' AND r.status = ?';
    params.push(status);
  }

  const [rows] = await db.query<ReferralRow[]>(
    `SELECT ${FIELDS} FROM ${FROM} WHERE ${where} ORDER BY r.created_at DESC`,
    params,
  );
  return rows;
}

export async function updateStatus(db: Db, id: number, status: string): Promise<void> {
  await db.execute(`UPDATE clinical_referrals SET status = ? WHERE id = ?`, [status, id]);
}
