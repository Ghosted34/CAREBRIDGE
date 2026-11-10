import { z } from 'zod';

// Strip invisible characters (zero-width spaces etc.) that sneak in when emails are copied from chat apps.
const invisible = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
const cleanEmail = z.preprocess(
  (v) => (typeof v === 'string' ? v.replace(invisible, '').trim() : v),
  z.email().max(190),
);

/**
 * Facility details a clinic registers with at sign-up. The provider starts `pending`:
 * nothing is public and nobody can be booked until CareBridge verifies it.
 */
export const ClinicDetails = z.object({
  legal_name: z.string().trim().min(2).max(190),
  display_name: z.string().trim().min(2).max(190),
  provider_type: z
    .enum(['clinic', 'hospital', 'specialist', 'diagnostic_centre'])
    .default('clinic'),
  registration_number: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100).default('Lagos'),
  address: z.string().trim().min(5).max(255),
  specialties: z.array(z.string().trim().min(2).max(100)).min(1),
  services: z.array(z.string().trim().min(2).max(150)).optional(),
});

export const RegisterBody = z.object({
  full_name: z.string().trim().min(2).max(160),
  email: cleanEmail.transform((e) => e.toLowerCase()),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{7,20}$/, 'Phone must contain 7–20 digits, optionally starting with +'),
  password: z.string().min(10).max(128),
  role: z.enum(['patient', 'provider_staff']).default('patient'),
  clinic: ClinicDetails.optional(),
  // Both required: you can't hold an account without accepting the current terms and privacy notice.
  accept_terms: z.literal(true, { error: 'You must accept the terms of use' }),
  accept_privacy: z.literal(true, { error: 'You must accept the privacy notice' }),
  marketing_opt_in: z.boolean().default(false),
});

export const LoginBody = z.object({
  email: cleanEmail.transform((e) => e.toLowerCase()),
  password: z.string().min(1).max(128),
});
