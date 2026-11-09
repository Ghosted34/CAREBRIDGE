import { z } from 'zod';
import { PROVIDER_ROLES } from '../../types.js';
import { Pagination } from '../../lib/validate.js';

export const UsersQuery = Pagination.extend({
  status: z.enum(['pending', 'active', 'suspended']).optional(),
  role: z.enum(['patient', 'provider_staff', 'operator', 'admin']).optional(),
});

export const ProvidersQuery = Pagination.extend({
  verification_status: z.enum(['pending', 'verified', 'rejected', 'suspended']).optional(),
});

export const AuditLogsQuery = Pagination.extend({
  action: z.string().optional(),
  entity_type: z.string().optional(),
  entity_id: z.coerce.number().int().positive().optional(),
  actor_user_id: z.coerce.number().int().positive().optional(),
});

export const SetUserStatusBody = z.object({ status: z.enum(['active', 'suspended']) });

export const CreateProviderBody = z.object({
  legal_name: z.string().trim().min(2).max(190),
  display_name: z.string().trim().min(2).max(190),
  provider_type: z.enum(['clinic', 'hospital', 'specialist', 'diagnostic_centre']),
  registration_number: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100).default('Lagos'),
  address: z.string().trim().min(5).max(255),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  specialties: z.array(z.string().trim().min(2).max(100)).min(1),
  services: z.array(z.string().trim().min(2).max(150)).optional(),
});

export const SetVerificationBody = z.object({
  verification_status: z.enum(['verified', 'rejected', 'suspended']),
});

export const AddMemberBody = z.object({
  user_id: z.number().int().positive(),
  provider_role: z.enum(PROVIDER_ROLES),
});
