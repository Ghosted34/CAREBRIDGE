import { z } from 'zod';

export const RegisterBody = z.object({
  full_name: z.string().trim().min(2).max(160),
  email: z
    .email()
    .max(190)
    .transform((e) => e.toLowerCase()),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{7,20}$/, 'Phone must contain 7–20 digits, optionally starting with +'),
  password: z.string().min(10).max(128),
  role: z.enum(['patient', 'provider_staff']).default('patient'),
});

export const LoginBody = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(1).max(128),
});
