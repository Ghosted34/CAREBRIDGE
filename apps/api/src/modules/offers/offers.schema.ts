import { z } from 'zod';
import { Pagination } from '../../lib/validate.js';

export const CreateOfferBody = z.object({
  provider_id: z.number().int().positive(),
  message: z.string().trim().max(1000).optional(),
});

/** `GET /offers/mine` — staff may scope the list to one of their clinics. */
export const MineQuery = Pagination.extend({
  provider_id: z.coerce.number().int().positive().optional(),
});
export type MineQuery = z.infer<typeof MineQuery>;
