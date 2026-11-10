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
