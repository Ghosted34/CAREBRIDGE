import { z } from 'zod';
import { Pagination } from '../../lib/validate.js';

export const CreateRequestBody = z.object({
  specialty: z.string().trim().min(2).max(100),
  service_type: z.string().trim().min(2).max(150),
  description: z.string().trim().min(10).max(4000),
  preferred_city: z.string().trim().min(2).max(100).default('Lagos'),
  urgency: z.enum(['routine', 'soon', 'urgent']).default('routine'),
  // Asked explicitly on every request; true means we must not queue it (see EMERGENCY_GUIDANCE).
  has_emergency_symptoms: z.boolean(),
  // Optional: the patient picked a clinic in the directory, so the request goes straight to it.
  target_provider_id: z.number().int().positive().optional(),
});

/** Staff may narrow a list to one clinic; the service checks they belong to it. */
const ProviderScope = z.object({
  provider_id: z.coerce.number().int().positive().optional(),
});

export const AssignedQuery = Pagination.merge(ProviderScope).extend({
  status: z
    .enum([
      'provider_accepted',
      'assessment',
      'treatment_planned',
      'in_progress',
      'completed',
      'cancelled',
    ])
    .optional(),
});

export const QueueQuery = Pagination.merge(ProviderScope).extend({
  specialty: z.string().trim().min(2).max(100).optional(),
});
