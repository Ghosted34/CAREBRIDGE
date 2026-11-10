import { z } from 'zod';
import { Pagination } from '../../lib/validate.js';
import { TEAM_ROLES } from '../../types.js';

/** A clinic owner adding someone to their own team. Owners are appointed by CareBridge, not here. */
export const AddTeamMemberBody = z.object({
  user_id: z.number().int().positive(),
  provider_role: z.enum(TEAM_ROLES),
});

export const SearchStaffQuery = Pagination.extend({
  q: z.string().trim().min(2).max(190),
});

// ---- operating centres ----

export const CreateCentreBody = z.object({
  name: z.string().trim().min(2).max(190),
  address: z.string().trim().min(2).max(255),
  city: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(50).optional().nullable(),
  is_active: z.boolean().default(true),
});
export type CreateCentreBody = z.infer<typeof CreateCentreBody>;

export const UpdateCentreBody = z.object({
  name: z.string().trim().min(2).max(190).optional(),
  address: z.string().trim().min(2).max(255).optional(),
  city: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().max(50).optional().nullable(),
  is_active: z.boolean().optional(),
});
export type UpdateCentreBody = z.infer<typeof UpdateCentreBody>;

export const CentreParam = z.object({
  centreId: z.coerce.number().int().positive(),
});

export const CentreScheduleQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z.enum(['available', 'held', 'booked', 'cancelled']).optional(),
});
export type CentreScheduleQuery = z.infer<typeof CentreScheduleQuery>;

// A schedule day for a centre, same shape as provider-level schedules (see slots.schema).
export const CentreScheduleInput = z.object({
  day_of_week: z.number().int().min(0).max(6),
  open_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
  close_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
  slot_duration_minutes: z.number().int().min(10).max(180).default(30),
  is_active: z.boolean().default(true),
});
export type CentreScheduleInput = z.infer<typeof CentreScheduleInput>;

export const SetCentreSchedulesBody = z.object({
  schedules: z.array(CentreScheduleInput).min(1),
});
export type SetCentreSchedulesBody = z.infer<typeof SetCentreSchedulesBody>;

export const GenerateCentreSlotsBody = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type GenerateCentreSlotsBody = z.infer<typeof GenerateCentreSlotsBody>;

// ---- centre caregivers ----

export const AddCentreCaregiverBody = z.object({
  user_id: z.number().int().positive(),
  is_active: z.boolean().default(true),
});
export type AddCentreCaregiverBody = z.infer<typeof AddCentreCaregiverBody>;
