import { z } from 'zod';
import { TIME_OF_DAY } from './freeTimes.js';
import { PROBLEM_KEYS } from './problems.js';

const LagosDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/** One "I'm free…" period: a Lagos date range and a part of the day. */
export const Period = z
  .object({
    from_date: LagosDate,
    to_date: LagosDate,
    time_of_day: z.enum(Object.keys(TIME_OF_DAY) as [keyof typeof TIME_OF_DAY]).default('any'),
  })
  .refine((p) => p.to_date >= p.from_date, {
    message: 'to_date must be on or after from_date',
    path: ['to_date'],
  });

export const SearchBody = z.object({
  problem: z.enum(PROBLEM_KEYS),
  periods: z.array(Period).min(1).max(5),
  /** Override the address on the patient's profile (e.g. searching near work). */
  city: z.string().trim().min(2).max(100).optional(),
  state: z.string().trim().min(2).max(100).optional(),
});
export type SearchBody = z.infer<typeof SearchBody>;

export const CentreAvailabilityQuery = z.object({
  from_date: LagosDate,
  to_date: LagosDate,
  time_of_day: z.enum(Object.keys(TIME_OF_DAY) as [keyof typeof TIME_OF_DAY]).default('any'),
});
