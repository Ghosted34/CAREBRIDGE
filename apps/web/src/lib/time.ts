/**
 * All API times are UTC ISO-8601. The pilot runs in Lagos, so the UI shows and accepts
 * Africa/Lagos time. Lagos is UTC+01:00 all year (no daylight saving), which makes
 * converting a <input type="datetime-local"> value exact.
 */
export const LAGOS_TZ = 'Africa/Lagos';
const LAGOS_OFFSET = '+01:00';

const dateTimeFmt = new Intl.DateTimeFormat('en-NG', {
  timeZone: LAGOS_TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const dateFmt = new Intl.DateTimeFormat('en-NG', {
  timeZone: LAGOS_TZ,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat('en-NG', {
  timeZone: LAGOS_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));
export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatTimeRange = (start: string, end: string) =>
  `${dateTimeFmt.format(new Date(start))}–${timeFmt.format(new Date(end))}`;

/** '2026-11-10T09:30' (Lagos wall clock) → '2026-11-10T09:30:00+01:00'. */
export function lagosLocalToIso(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new Error(`Invalid local time: ${local}`);
  return `${local}:00${LAGOS_OFFSET}`;
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

/** Lagos wall-clock 'YYYY-MM-DDTHH:mm' for an instant (for datetime-local defaults/min). */
export function toLagosLocal(date: Date | string = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const lagos = new Date(d.getTime() + 60 * 60_000); // shift UTC → UTC+1, then read as UTC
  return lagos.toISOString().slice(0, 16);
}

/** Tomorrow at 09:00 Lagos time, as a datetime-local value. */
export function defaultSlot(now = new Date()): string {
  const tomorrow = toLagosLocal(new Date(now.getTime() + 24 * 3600_000)).slice(0, 10);
  return `${tomorrow}T09:00`;
}

const dayFmt = new Intl.DateTimeFormat('en-NG', {
  timeZone: LAGOS_TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
/** 'Thu 12 Nov' in Lagos. */
export const formatDay = (iso: string) => dayFmt.format(new Date(iso));
/** '09:30' in Lagos. */
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));

/** Today's Lagos date, 'YYYY-MM-DD'. */
export const lagosToday = (now = new Date()) => toLagosLocal(now).slice(0, 10);

/** 'YYYY-MM-DD' plus n days (calendar arithmetic, no time zone involved). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Group ISO instants by their Lagos date, keeping order. */
export function groupByLagosDay<T extends { starts_at: string }>(items: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = toLagosLocal(item.starts_at).slice(0, 10);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups];
}
