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

export const GenerateSlotsBody = z.object({
  /** Which operating centre the slots belong to. */
  centre_id: z.number().int().positive(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Price for all generated slots (defaults to the provider's consultancy fee). */
  price: z.number().nonnegative().optional(),
  currency: z.string().length(3).default('NGN'),
});
export type GenerateSlotsBody = z.infer<typeof GenerateSlotsBody>;

export const CreateSlotBody = z.object({
  /** Which operating centre the slot belongs to. */
  centre_id: z.number().int().positive(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  /** Price for this slot (defaults to the provider's consultancy fee). */
  price: z.number().nonnegative().optional(),
  currency: z.string().length(3).default('NGN'),
});
export type CreateSlotBody = z.infer<typeof CreateSlotBody>;

export const ListSlotsQuery = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  status: z.enum(['available', 'held', 'booked', 'cancelled']).optional(),
  centre_id: z.coerce.number().int().positive().optional(),
});
export type ListSlotsQuery = z.infer<typeof ListSlotsQuery>;
