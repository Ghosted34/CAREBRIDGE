import { z } from 'zod';

export const CreateEstimateBody = z.object({
  amount: z.number().positive().max(100_000_000),
  currency: z.string().length(3).default('NGN'),
  inclusions: z.string().max(2000).optional(),
  exclusions: z.string().max(2000).optional(),
  valid_until: z.string().datetime().optional(),
});
export type CreateEstimateBody = z.infer<typeof CreateEstimateBody>;
