import type { SearchPeriod } from '../api/types';
import { addDays, lagosToday } from './time';

/** A default "I'm free" period: tomorrow for a week, any time of day. */
export const newPeriod = (from = addDays(lagosToday(), 1), days = 6): SearchPeriod => ({
  from_date: from,
  to_date: addDays(from, days),
  time_of_day: 'any',
});
