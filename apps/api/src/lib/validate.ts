import { z } from 'zod';
import { AppError } from './errors.js';

/** Parse untrusted input or throw a 400 AppError with field-level details. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw AppError.badRequest('Invalid request', z.flattenError(result.error));
  }
  return result.data;
}

export const IdParam = z.object({ id: z.coerce.number().int().positive() });

export const Pagination = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type Pagination = z.infer<typeof Pagination>;
