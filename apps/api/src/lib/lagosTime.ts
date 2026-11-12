/**
 * Clinic opening hours are Lagos wall-clock times; everything stored or sent is UTC.
 * Africa/Lagos is UTC+01:00 all year (no daylight saving), so conversion is a fixed offset.
 * (If CareBridge expands beyond WAT, store a time zone per centre and replace this module.)
 */
const OFFSET_MS = 60 * 60_000;

/** Lagos calendar date 'YYYY-MM-DD', weekday (0 = Sunday … 6 = Saturday) and minutes since midnight. */
export function lagosParts(instant: Date) {
  const shifted = new Date(instant.getTime() + OFFSET_MS);
  return {
    date: shifted.toISOString().slice(0, 10),
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** The UTC instant for a Lagos date ('YYYY-MM-DD') plus minutes since local midnight. */
export function lagosToUtc(date: string, minutes: number): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) + minutes * 60_000 - OFFSET_MS);
}

/** Weekday (0 = Sunday) of a 'YYYY-MM-DD' date. */
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** 'YYYY-MM-DD' + n days. */
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** 'HH:MM' or 'HH:MM:SS' → minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h = '0', m = '0'] = t.split(':');
  return Number(h) * 60 + Number(m);
}
