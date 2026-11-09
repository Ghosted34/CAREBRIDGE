import type { Db, Result, Row } from '../../db/pool.js';

export interface EstimateRow extends Row {
  id: number;
  care_request_id: number;
  provider_id: number;
  provider: string;
  currency: string;
  amount: number | string;
  inclusions: string | null;
  exclusions: string | null;
  valid_until: string | null;
  status: 'draft' | 'issued' | 'accepted' | 'rejected' | 'expired';
  created_at: string;
}

const FIELDS = `e.id, e.care_request_id, e.provider_id, p.display_name AS provider, e.currency,
  e.amount, e.inclusions, e.exclusions, e.valid_until, e.status, e.created_at`;
const FROM = `service_estimates e JOIN providers p ON p.id = e.provider_id`;

export async function insert(
  db: Db,
  e: {
    care_request_id: number;
    provider_id: number;
    currency: string;
    amount: number;
    inclusions?: string;
    exclusions?: string;
    valid_until?: Date | null;
    status: string;
  },
): Promise<number> {
  const [res] = await db.execute<Result>(
    `INSERT INTO service_estimates (care_request_id, provider_id, currency, amount,
       inclusions, exclusions, valid_until, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      e.care_request_id,
      e.provider_id,
      e.currency,
      e.amount,
      e.inclusions ?? null,
      e.exclusions ?? null,
      e.valid_until ?? null,
      e.status,
    ],
  );
  return res.insertId;
}

export async function findById(
  db: Db,
  id: number,
  opts: { forUpdate?: boolean } = {},
): Promise<EstimateRow | null> {
  const [rows] = await db.execute<EstimateRow[]>(
    `SELECT ${FIELDS} FROM ${FROM} WHERE e.id = ?${opts.forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findByRequest(db: Db, careRequestId: number): Promise<EstimateRow[]> {
  const [rows] = await db.execute<EstimateRow[]>(
    `SELECT ${FIELDS} FROM ${FROM} WHERE e.care_request_id = ? ORDER BY e.created_at DESC`,
    [careRequestId],
  );
  return rows;
}

export async function updateStatus(db: Db, id: number, status: string): Promise<void> {
  await db.execute(`UPDATE service_estimates SET status = ? WHERE id = ?`, [status, id]);
}
