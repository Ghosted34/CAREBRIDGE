import { z } from 'zod';

export const CreateOfferBody = z.object({
  provider_id: z.number().int().positive(),
  message: z.string().trim().max(1000).optional(),
});
