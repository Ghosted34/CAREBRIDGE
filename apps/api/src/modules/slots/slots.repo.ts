import type { Db, Result, Row } from '../../db/pool.js';
import type { z } from 'zod';
import type { DayScheduleSchema, ListSlotsQuery } from './slots.schema.js';

type DaySchedule = z.infer<typeof DayScheduleSchema>;

export interface ProviderScheduleRow extends Row {
  id: number;
  provider_id: number;
  centre_id: number;
  day_of_week: number;
  open_time: string;
  close_time: string;
  slot_duration_minutes: number;
  is_active: number;
}

export interface ProviderSlotRow extends Row {
  id: number;
  provider_id: number;
  centre_id: number;
  start_time: string;
  end_time: string;
  status: 'available' | 'held' | 'booked' | 'cancelled';
  price: number | null;
  currency: string | null;
  appointment_id: number | null;
  created_at: string;
}

export async function findSchedulesByProvider(
  db: Db,
  providerId: number,
): Promise<ProviderScheduleRow[]> {
  const [rows] = await db.execute<ProviderScheduleRow[]>(
    `SELECT id, provider_id, centre_id, day_of_week, open_time, close_time, slot_duration_minutes, is_active
       FROM provider_schedules
      WHERE provider_id = ?
      ORDER BY day_of_week ASC`,
    [providerId],
  );
  return rows;
}

export async function findSchedulesByCentre(
  db: Db,
  centreId: number,
): Promise<ProviderScheduleRow[]> {
  const [rows] = await db.execute<ProviderScheduleRow[]>(
    `SELECT id, provider_id, centre_id, day_of_week, open_time, close_time, slot_duration_minutes, is_active
       FROM provider_schedules
      WHERE centre_id = ?
      ORDER BY day_of_week ASC`,
    [centreId],
  );
  return rows;
}

export async function findSchedulesByProviderAndCentre(
  db: Db,
  providerId: number,
  centreId: number,
): Promise<ProviderScheduleRow[]> {
  const [rows] = await db.execute<ProviderScheduleRow[]>(
    `SELECT id, provider_id, centre_id, day_of_week, open_time, close_time, slot_duration_minutes, is_active
       FROM provider_schedules
      WHERE provider_id = ? AND centre_id = ?
      ORDER BY day_of_week ASC`,
    [providerId, centreId],
  );
  return rows;
}

export async function replaceSchedules(
  db: Db,
  providerId: number,
  centreId: number,
  schedules: DaySchedule[],
): Promise<void> {
  await db.execute(`DELETE FROM provider_schedules WHERE provider_id = ? AND centre_id = ?`, [
    providerId,
    centreId,
  ]);
  for (const s of schedules) {
    await db.execute(
      `INSERT INTO provider_schedules (provider_id, centre_id, day_of_week, open_time, close_time, slot_duration_minutes, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        providerId,
        centreId,
        s.day_of_week,
        s.open_time,
        s.close_time,
        s.slot_duration_minutes,
        s.is_active ? 1 : 0,
      ],
    );
  }
}

export async function findSlots(
  db: Db,
  providerId: number,
  query: ListSlotsQuery & { centreId?: number },
): Promise<ProviderSlotRow[]> {
  const clauses = ['provider_id = ?'];
  const params: (string | number | Date)[] = [providerId];

  if (query.centreId !== undefined) {
    clauses.push('centre_id = ?');
    params.push(query.centreId);
  }
  if (query.from) {
    clauses.push('start_time >= ?');
    params.push(new Date(query.from));
  }
  if (query.to) {
    clauses.push('end_time <= ?');
    params.push(new Date(query.to));
  }
  if (query.status) {
    clauses.push('status = ?');
    params.push(query.status);
  }

  const [rows] = await db.query<ProviderSlotRow[]>(
    `SELECT id, provider_id, centre_id, start_time, end_time, status, price, currency, appointment_id, created_at
       FROM provider_slots
      WHERE ${clauses.join(' AND ')}
      ORDER BY start_time ASC`,
    params,
  );
  return rows;
}

export async function findSlotsByCentre(
  db: Db,
  centreId: number,
  query: ListSlotsQuery,
): Promise<ProviderSlotRow[]> {
  const clauses = ['centre_id = ?'];
  const params: (string | number | Date)[] = [centreId];

  if (query.from) {
    clauses.push('start_time >= ?');
    params.push(new Date(query.from));
  }
  if (query.to) {
    clauses.push('end_time <= ?');
    params.push(new Date(query.to));
  }
  if (query.status) {
    clauses.push('status = ?');
    params.push(query.status);
  }

  const [rows] = await db.query<ProviderSlotRow[]>(
    `SELECT id, provider_id, centre_id, start_time, end_time, status, price, currency, appointment_id, created_at
       FROM provider_slots
      WHERE ${clauses.join(' AND ')}
      ORDER BY start_time ASC`,
    params,
  );
  return rows;
}

export async function findSlotById(
  db: Db,
  id: number,
  opts: { forUpdate?: boolean } = {},
): Promise<ProviderSlotRow | null> {
  const [rows] = await db.execute<ProviderSlotRow[]>(
    `SELECT id, provider_id, centre_id, start_time, end_time, status, price, currency, appointment_id, created_at
       FROM provider_slots
      WHERE id = ?${opts.forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findSlotByAppointment(
  db: Db,
  appointmentId: number,
): Promise<ProviderSlotRow | null> {
  const [rows] = await db.execute<ProviderSlotRow[]>(
    `SELECT id, provider_id, centre_id, start_time, end_time, status, price, currency, appointment_id, created_at
       FROM provider_slots
      WHERE appointment_id = ?`,
    [appointmentId],
  );
  return rows[0] ?? null;
}

export async function insertSlot(
  db: Db,
  centreId: number,
  providerId: number,
  startTime: Date,
  endTime: Date,
  price: number | null = null,
  currency: string | null = null,
): Promise<number> {
  const [result] = await db.execute<Result>(
    `INSERT INTO provider_slots (provider_id, centre_id, start_time, end_time, status, price, currency)
     VALUES (?, ?, ?, ?, 'available', ?, ?)`,
    [providerId, centreId, startTime, endTime, price, currency],
  );
  return result.insertId;
}

export async function insertSlotsBulk(
  db: Db,
  centreId: number,
  providerId: number,
  slots: { start_time: Date; end_time: Date; price?: number | null; currency?: string | null }[],
): Promise<number> {
  let createdCount = 0;
  for (const slot of slots) {
    const [res] = await db.execute<Result>(
      `INSERT IGNORE INTO provider_slots (provider_id, centre_id, start_time, end_time, status, price, currency)
       VALUES (?, ?, ?, ?, 'available', ?, ?)`,
      [
        providerId,
        centreId,
        slot.start_time,
        slot.end_time,
        slot.price ?? null,
        slot.currency ?? null,
      ],
    );
    if (res.affectedRows > 0) createdCount++;
  }
  return createdCount;
}

export async function updateSlotStatus(
  db: Db,
  id: number,
  status: 'available' | 'held' | 'booked' | 'cancelled',
  appointmentId: number | null = null,
): Promise<void> {
  await db.execute(`UPDATE provider_slots SET status = ?, appointment_id = ? WHERE id = ?`, [
    status,
    appointmentId,
    id,
  ]);
}

export async function updateSlotPrice(
  db: Db,
  id: number,
  price: number | null,
  currency: string | null,
): Promise<void> {
  await db.execute(`UPDATE provider_slots SET price = ?, currency = ? WHERE id = ?`, [
    price,
    currency,
    id,
  ]);
}
