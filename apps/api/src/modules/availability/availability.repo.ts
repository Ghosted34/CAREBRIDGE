import type { Db, Row } from '../../db/pool.js';
import type { Interval, OpeningHours } from './freeTimes.js';

/** Active centres of verified, active providers that list any of `specialties`. */
export async function candidateCentres(db: Db, specialties: readonly string[], centreId?: number) {
  const [rows] = await db.query<Row[]>(
    `SELECT c.id, c.provider_id, c.name, c.address_line, c.city, c.state, c.phone,
            p.display_name AS provider_name, p.specialties
       FROM provider_centres c JOIN providers p ON p.id = c.provider_id
      WHERE c.is_active = TRUE AND p.verification_status = 'verified' AND p.status = 'active'
        AND (${specialties.map(() => 'JSON_CONTAINS(p.specialties, JSON_QUOTE(?))').join(' OR ')})
        ${centreId ? 'AND c.id = ?' : ''}`,
    [...specialties, ...(centreId ? [centreId] : [])],
  );
  return rows;
}

/**
 * One centre with its provider, for booking. With `forUpdate`, the centre row is locked FIRST — before
 * any plain read — so this transaction's snapshot is taken after other bookings at the centre commit.
 * (In InnoDB the snapshot starts at the first non-locking read; reading before locking would let two
 * concurrent bookings both miss each other.) Portable: no FOR UPDATE OF, which MariaDB lacks.
 */
export async function findBookableCentre(
  db: Db,
  centreId: number,
  opts: { forUpdate?: boolean } = {},
) {
  if (opts.forUpdate) {
    await db.execute('SELECT id FROM provider_centres WHERE id = ? FOR UPDATE', [centreId]);
  }
  const [rows] = await db.execute<Row[]>(
    `SELECT c.id, c.provider_id, c.name, c.city, c.state, c.is_active,
            p.display_name AS provider_name, p.specialties, p.verification_status, p.status AS provider_status
       FROM provider_centres c JOIN providers p ON p.id = c.provider_id
      WHERE c.id = ?`,
    [centreId],
  );
  return rows[0];
}

export async function openingHours(db: Db, centreIds: number[]) {
  const map = new Map<number, OpeningHours[]>();
  if (!centreIds.length) return map;
  const [rows] = await db.query<Row[]>(
    `SELECT centre_id, day_of_week, TIME_FORMAT(open_time, '%H:%i') AS open_time,
            TIME_FORMAT(close_time, '%H:%i') AS close_time, slot_duration_minutes
       FROM provider_schedules WHERE centre_id IN (?) AND is_active = TRUE`,
    [centreIds],
  );
  for (const r of rows) {
    map.set(r.centre_id, [...(map.get(r.centre_id) ?? []), r as unknown as OpeningHours]);
  }
  return map;
}

/** Appointments that occupy a centre's time (anything not cancelled, completed or a no-show). */
export const BLOCKING_STATUSES = ['requested', 'booked', 'confirmed', 'checked_in'];

export async function busyTimes(db: Db, centreIds: number[], from: Date, to: Date) {
  const map = new Map<number, Interval[]>();
  if (!centreIds.length) return map;
  const [rows] = await db.query<Row[]>(
    `SELECT centre_id, starts_at, ends_at FROM appointments
      WHERE centre_id IN (?) AND status IN (?) AND starts_at < ? AND ends_at > ?`,
    [centreIds, BLOCKING_STATUSES, to, from],
  );
  for (const r of rows) {
    map.set(r.centre_id, [
      ...(map.get(r.centre_id) ?? []),
      { start: new Date(r.starts_at), end: new Date(r.ends_at) },
    ]);
  }
  return map;
}

/** Consultation fee per centre: a centre-specific fee wins over the provider-wide one. */
export async function consultationFees(db: Db, providerIds: number[]) {
  if (!providerIds.length) return [];
  const [rows] = await db.query<Row[]>(
    `SELECT provider_id, centre_id, amount, currency FROM provider_fees
      WHERE provider_id IN (?) AND fee_type = 'consultancy' AND is_active = TRUE`,
    [providerIds],
  );
  return rows;
}

export async function caregivers(db: Db, centreIds: number[]) {
  const map = new Map<number, { id: number; full_name: string; role: string }[]>();
  if (!centreIds.length) return map;
  const [rows] = await db.query<Row[]>(
    `SELECT id, centre_id, full_name, role FROM provider_caregivers
      WHERE centre_id IN (?) AND is_active = TRUE ORDER BY full_name`,
    [centreIds],
  );
  for (const r of rows) {
    map.set(r.centre_id, [
      ...(map.get(r.centre_id) ?? []),
      { id: r.id, full_name: r.full_name, role: r.role },
    ]);
  }
  return map;
}

export async function patientAddress(db: Db, userId: number) {
  const [rows] = await db.execute<Row[]>(
    'SELECT address_city, address_state FROM users WHERE id = ?',
    [userId],
  );
  return { city: rows[0]?.address_city ?? null, state: rows[0]?.address_state ?? null } as {
    city: string | null;
    state: string | null;
  };
}
