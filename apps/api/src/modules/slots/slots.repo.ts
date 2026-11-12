import type { Db, Row } from '../../db/pool.js';
import type { z } from 'zod';
import type { DayScheduleSchema } from './slots.schema.js';

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
