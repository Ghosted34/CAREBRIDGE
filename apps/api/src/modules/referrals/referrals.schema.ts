import { z } from 'zod';

export const CreateReferralBody = z.object({
  receiving_provider_id: z.number().int().positive(),
  referred_specialty: z.string().min(2).max(100),
  clinical_summary: z.string().min(5).max(2000),
});
export type CreateReferralBody = z.infer<typeof CreateReferralBody>;

export const ListReferralsQuery = z.object({
  type: z.enum(['incoming', 'outgoing', 'all']).default('all'),
  status: z.enum(['draft', 'sent', 'accepted', 'declined', 'completed', 'cancelled']).optional(),
});
export type ListReferralsQuery = z.infer<typeof ListReferralsQuery>;
