import type { Db, Result, Row } from '../../db/pool.js';

export interface PaymentRow extends Row {
  id: number;
  care_request_id: number;
  payer_user_id: number;
  payer_name: string;
  payee_provider_id: number | null;
  payee_provider: string | null;
  amount: number | string;
  currency: string;
  payment_provider: string | null;
  provider_reference: string | null;
  status: 'initiated' | 'pending' | 'successful' | 'failed' | 'refunded';
  created_at: string;
}

const FIELDS = `py.id, py.care_request_id, py.payer_user_id, u.full_name AS payer_name,
  py.payee_provider_id, p.display_name AS payee_provider, py.amount, py.currency,
  py.payment_provider, py.provider_reference, py.status, py.created_at`;
const FROM = `payments py
  JOIN users u ON u.id = py.payer_user_id
  LEFT JOIN providers p ON p.id = py.payee_provider_id`;

export async function insert(
  db: Db,
  p: {
    care_request_id: number;
    payer_user_id: number;
    payee_provider_id: number | null;
    amount: number;
    currency: string;
    payment_provider: string;
    provider_reference: string;
    status: string;
  },
): Promise<number> {
  const [res] = await db.execute<Result>(
    `INSERT INTO payments (care_request_id, payer_user_id, payee_provider_id,
       amount, currency, payment_provider, provider_reference, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.care_request_id,
      p.payer_user_id,
      p.payee_provider_id,
      p.amount,
      p.currency,
      p.payment_provider,
      p.provider_reference,
      p.status,
    ],
  );
  return res.insertId;
}

export async function findById(
  db: Db,
  id: number,
  opts: { forUpdate?: boolean } = {},
): Promise<PaymentRow | null> {
  const [rows] = await db.execute<PaymentRow[]>(
    `SELECT ${FIELDS} FROM ${FROM} WHERE py.id = ?${opts.forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findByReference(
  db: Db,
  ref: string,
  opts: { forUpdate?: boolean } = {},
): Promise<PaymentRow | null> {
  const [rows] = await db.execute<PaymentRow[]>(
    `SELECT ${FIELDS} FROM ${FROM} WHERE py.provider_reference = ?${opts.forUpdate ? ' FOR UPDATE' : ''}`,
    [ref],
  );
  return rows[0] ?? null;
}

export async function findByRequest(db: Db, careRequestId: number): Promise<PaymentRow[]> {
  const [rows] = await db.execute<PaymentRow[]>(
    `SELECT ${FIELDS} FROM ${FROM} WHERE py.care_request_id = ? ORDER BY py.created_at DESC`,
    [careRequestId],
  );
  return rows;
}

export async function updateStatus(db: Db, id: number, status: string): Promise<void> {
  await db.execute(`UPDATE payments SET status = ? WHERE id = ?`, [status, id]);
}
