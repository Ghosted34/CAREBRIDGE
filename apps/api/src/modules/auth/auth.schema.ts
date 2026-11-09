import { z } from 'zod';

// Strip invisible characters (zero-width spaces etc.) that sneak in when emails are copied from chat apps.
const invisible = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
const cleanEmail = z.preprocess(
  (v) => (typeof v === 'string' ? v.replace(invisible, '').trim() : v),
  z.email().max(190),
);

export const RegisterBody = z.object({
  full_name: z.string().trim().min(2).max(160),
  email: cleanEmail.transform((e) => e.toLowerCase()),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{7,20}$/, 'Phone must contain 7–20 digits, optionally starting with +'),
  password: z.string().min(10).max(128),
  role: z.enum(['patient', 'provider_staff']).default('patient'),
  // Both required: you can't hold an account without accepting the current terms and privacy notice.
  accept_terms: z.literal(true, { error: 'You must accept the terms of use' }),
  accept_privacy: z.literal(true, { error: 'You must accept the privacy notice' }),
  marketing_opt_in: z.boolean().default(false),
});

export const LoginBody = z.object({
  email: cleanEmail.transform((e) => e.toLowerCase()),
  password: z.string().min(1).max(128),
});
