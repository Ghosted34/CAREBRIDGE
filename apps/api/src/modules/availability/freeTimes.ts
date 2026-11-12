/**
 * Pure free-time calculation: opening hours (Lagos time) minus busy appointments, inside the
 * patient's requested windows. No database access, so it is unit-tested exhaustively.
 *
 * Capacity rule: ONE appointment at a time per centre.
 */
import { addDays, lagosToUtc, timeToMinutes, weekdayOf } from '../../lib/lagosTime.js';

export interface OpeningHours {
  /** 0 = Sunday … 6 = Saturday */
  day_of_week: number;
  /** Lagos wall clock, 'HH:MM[:SS]' */
  open_time: string;
  close_time: string;
  slot_duration_minutes: number;
}

export interface Interval {
  start: Date;
  end: Date;
}

/** A Lagos-time window on a date range: e.g. 12–14 Nov, mornings (00:00–12:00). */
export interface Window {
  /** inclusive Lagos dates 'YYYY-MM-DD' */
  from_date: string;
  to_date: string;
  /** minutes since Lagos midnight */
  start_minute: number;
  end_minute: number;
}

export const TIME_OF_DAY = {
  any: [0, 24 * 60],
  morning: [0, 12 * 60],
  afternoon: [12 * 60, 17 * 60],
  evening: [17 * 60, 24 * 60],
} as const satisfies Record<string, readonly [number, number]>;
export type TimeOfDay = keyof typeof TIME_OF_DAY;

/** Minimum notice before a slot can be requested. */
export const LEAD_MINUTES = 60;

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/**
 * Every free slot for one centre inside the windows, earliest first. A slot is free when it lies inside
 * that day's opening hours on the clinic's slot grid (open, open + duration, …), starts at least
 * LEAD_MINUTES from `now`, and overlaps no busy appointment at the centre.
 */
export function freeTimes(
  hours: OpeningHours[],
  busy: Interval[],
  windows: Window[],
  now: Date,
): Interval[] {
  const earliest = new Date(now.getTime() + LEAD_MINUTES * 60_000);
  const byDay = new Map<number, OpeningHours[]>();
  for (const h of hours) byDay.set(h.day_of_week, [...(byDay.get(h.day_of_week) ?? []), h]);

  const seen = new Set<number>();
  const out: Interval[] = [];
  for (const w of windows) {
    for (let date = w.from_date; date <= w.to_date; date = addDays(date, 1)) {
      for (const h of byDay.get(weekdayOf(date)) ?? []) {
        const open = timeToMinutes(h.open_time);
        const close = timeToMinutes(h.close_time);
        const step = h.slot_duration_minutes;
        for (let m = open; m + step <= close; m += step) {
          if (m < w.start_minute || m + step > w.end_minute) continue;
          const slot = { start: lagosToUtc(date, m), end: lagosToUtc(date, m + step) };
          if (slot.start < earliest) continue;
          if (busy.some((b) => overlaps(slot, b))) continue;
          if (seen.has(slot.start.getTime())) continue; // overlapping windows
          seen.add(slot.start.getTime());
          out.push(slot);
        }
      }
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Total number of days covered by the windows (to cap how much a single search can ask for). */
export function windowDays(windows: Window[]): number {
  let days = 0;
  for (const w of windows) {
    days += Math.round((Date.parse(w.to_date) - Date.parse(w.from_date)) / 86_400_000) + 1;
  }
  return days;
}
