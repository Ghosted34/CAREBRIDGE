import { z } from 'zod';

export const InitializePaymentBody = z.object({
  amount: z.number().positive().max(10_000_000),
  currency: z.string().length(3).default('NGN'),
  callback_url: z.string().url().optional(),
});
export type InitializePaymentBody = z.infer<typeof InitializePaymentBody>;

export const WebhookBody = z.object({
  event: z.string(),
  data: z.object({
    reference: z.string(),
    status: z.string().optional(),
    amount: z.number().optional(),
  }),
});
export type WebhookBody = z.infer<typeof WebhookBody>;
