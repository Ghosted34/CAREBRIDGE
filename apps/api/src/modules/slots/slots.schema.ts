import { z } from 'zod';

export const DayScheduleSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  open_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
  close_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
  slot_duration_minutes: z.number().int().min(10).max(180).default(30),
  is_active: z.boolean().default(true),
});

export const SetSchedulesBody = z.object({
  /** Which operating centre these opening hours belong to. */
  centre_id: z.number().int().positive(),
  schedules: z.array(DayScheduleSchema).min(1),
});
export type SetSchedulesBody = z.infer<typeof SetSchedulesBody>;
