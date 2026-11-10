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

/** Clinic owner adds or edits an operating centre. */
export const CreateCentreBody = z.object({
  name: z.string().trim().min(2).max(190),
  address_line: z.string().trim().min(2).max(255),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postal_code: z.string().trim().min(2).max(20),
  phone: z.string().trim().min(2).max(30).optional(),
});
export type CreateCentreBody = z.infer<typeof CreateCentreBody>;

export const UpdateCentreBody = z.object({
  name: z.string().trim().min(2).max(190).optional(),
  address_line: z.string().trim().min(2).max(255).optional(),
  city: z.string().trim().min(2).max(100).optional(),
  state: z.string().trim().min(2).max(100).optional(),
  postal_code: z.string().trim().min(2).max(20).optional(),
  phone: z.string().trim().min(2).max(30).optional().nullable(),
  is_active: z.boolean().optional(),
});
export type UpdateCentreBody = z.infer<typeof UpdateCentreBody>;

/** Clinic owner adds a caregiver to a centre. */
export const CreateCaregiverBody = z.object({
  centre_id: z.number().int().positive(),
  full_name: z.string().trim().min(2).max(160),
  role: z.enum(['dentist', 'caregiver', 'hygienist', 'specialist']),
});
export type CreateCaregiverBody = z.infer<typeof CreateCaregiverBody>;

/** Clinic owner sets or updates a fee type for their clinic (optionally centre-scoped). */
export const CreateProviderFeeBody = z.object({
  centre_id: z.number().int().positive().optional().nullable(),
  fee_type: z.enum(['consultancy', 'treatment', 'late_change', 'rescheduling', 'no_show', 'other']),
  amount: z.number().nonnegative().max(10_000_000),
  currency: z.string().length(3).default('NGN'),
  is_active: z.boolean().default(true),
});
export type CreateProviderFeeBody = z.infer<typeof CreateProviderFeeBody>;

export const UpdateProviderFeeBody = z.object({
  centre_id: z.number().int().positive().optional().nullable(),
  fee_type: z.enum(['consultancy', 'treatment', 'late_change', 'rescheduling', 'no_show', 'other']).optional(),
  amount: z.number().nonnegative().max(10_000_000).optional(),
  currency: z.string().length(3).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateProviderFeeBody = z.infer<typeof UpdateProviderFeeBody>;
