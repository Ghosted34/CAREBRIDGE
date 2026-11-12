import { pool, type Db } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import { lagosParts, lagosToUtc, addDays } from '../../lib/lagosTime.js';
import { freeTimes, TIME_OF_DAY, windowDays, type Interval, type Window } from './freeTimes.js';
import * as repo from './availability.repo.js';
import { problemByKey, PROBLEMS } from './problems.js';
import type { SearchBody } from './availability.schema.js';

/** How far ahead a patient can look, and how much one search may cover. */
export const MAX_DAYS_AHEAD = 60;
export const MAX_SEARCH_DAYS = 31;
/** Free times returned per centre (the UI shows a handful per day). */
const MAX_TIMES_PER_CENTRE = 60;

export const listProblems = () => PROBLEMS.map(({ key, label }) => ({ key, label }));

type Match = 'same_area' | 'same_state' | 'elsewhere';
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** How close a centre is to the patient, by address (no map coordinates needed for the MVP). */
export function areaMatch(
  centre: { city: string; state: string },
  near: { city: string | null; state: string | null },
): Match {
  if (near.city && norm(centre.city) === norm(near.city)) return 'same_area';
  if (near.state && norm(centre.state) === norm(near.state)) return 'same_state';
  return 'elsewhere';
}
const MATCH_RANK: Record<Match, number> = { same_area: 0, same_state: 1, elsewhere: 2 };

/** Turn the patient's periods into Lagos windows, and check they're sensible. */
export function toWindows(periods: SearchBody['periods'], now: Date): Window[] {
  const today = lagosParts(now).date;
  const lastDay = addDays(today, MAX_DAYS_AHEAD);
  const windows = periods.map((p) => {
    const [start_minute, end_minute] = TIME_OF_DAY[p.time_of_day];
    return {
      from_date: p.from_date < today ? today : p.from_date,
      to_date: p.to_date,
      start_minute,
      end_minute,
    };
  });
  if (windows.some((w) => w.to_date < today)) {
    throw AppError.badRequest('Choose dates from today onwards');
  }
  if (windows.some((w) => w.to_date > lastDay)) {
    throw AppError.badRequest(`You can search up to ${MAX_DAYS_AHEAD} days ahead`);
  }
  if (windowDays(windows) > MAX_SEARCH_DAYS) {
    throw AppError.badRequest(`Search at most ${MAX_SEARCH_DAYS} days at a time`);
  }
  return windows;
}

/** The overall UTC span covered by windows, to fetch busy times in one query. */
function span(windows: Window[]): Interval {
  const from = windows.map((w) => w.from_date).sort()[0]!;
  const to = windows
    .map((w) => w.to_date)
    .sort()
    .at(-1)!;
  return { start: lagosToUtc(from, 0), end: lagosToUtc(addDays(to, 1), 0) };
}

/** Free times at the given centres inside the windows. */
export async function freeTimesFor(
  db: Db,
  centreIds: number[],
  windows: Window[],
  now = new Date(),
) {
  const { start, end } = span(windows);
  const [hours, busy] = await Promise.all([
    repo.openingHours(db, centreIds),
    repo.busyTimes(db, centreIds, start, end),
  ]);
  const result = new Map<number, Interval[]>();
  for (const id of centreIds) {
    result.set(id, freeTimes(hours.get(id) ?? [], busy.get(id) ?? [], windows, now));
  }
  return result;
}

const iso = (i: Interval) => ({ starts_at: i.start.toISOString(), ends_at: i.end.toISOString() });

/**
 * The MVP search: clinics whose specialty fits the problem, with centres near the patient that have
 * free times inside the patient's periods. Centres with no free time are left out. Ranked by area
 * (same city/area, then same state, then elsewhere), then by the earliest free time.
 */
export async function search(c: Ctx, body: SearchBody, now = new Date()) {
  const windows = toWindows(body.periods, now);
  const problem = problemByKey(body.problem);
  const profile = await repo.patientAddress(pool, c.user.id);
  const near = { city: body.city ?? profile.city, state: body.state ?? profile.state };

  const centres = await repo.candidateCentres(pool, problem.specialties);
  const centreIds = centres.map((x) => x.id as number);
  const [free, fees, people] = await Promise.all([
    freeTimesFor(pool, centreIds, windows, now),
    repo.consultationFees(pool, [...new Set(centres.map((x) => x.provider_id as number))]),
    repo.caregivers(pool, centreIds),
  ]);

  const feeFor = (providerId: number, centreId: number) => {
    const f =
      fees.find((x) => x.provider_id === providerId && x.centre_id === centreId) ??
      fees.find((x) => x.provider_id === providerId && x.centre_id === null);
    return f ? { amount: Number(f.amount), currency: f.currency as string } : null;
  };

  const rows = centres
    .map((centre) => {
      const times = free.get(centre.id) ?? [];
      return {
        centre_id: centre.id as number,
        centre_name: centre.name as string,
        address_line: centre.address_line as string,
        city: centre.city as string,
        state: centre.state as string,
        phone: (centre.phone as string | null) ?? null,
        provider_id: centre.provider_id as number,
        provider_name: centre.provider_name as string,
        match: areaMatch({ city: centre.city, state: centre.state }, near),
        consultation_fee: feeFor(centre.provider_id, centre.id),
        caregivers: people.get(centre.id) ?? [],
        free_count: times.length,
        free_times: times.slice(0, MAX_TIMES_PER_CENTRE).map(iso),
      };
    })
    .filter((r) => r.free_count > 0)
    .sort(
      (a, b) =>
        MATCH_RANK[a.match] - MATCH_RANK[b.match] ||
        a.free_times[0]!.starts_at.localeCompare(b.free_times[0]!.starts_at) ||
        a.provider_name.localeCompare(b.provider_name),
    );

  return { near, problem: { key: problem.key, label: problem.label }, results: rows };
}

/** Free times at one centre (rebooking, follow-ups, staff booking for a patient). */
export async function centreAvailability(
  centreId: number,
  q: { from_date: string; to_date: string; time_of_day: keyof typeof TIME_OF_DAY },
  now = new Date(),
) {
  const centre = await repo.findBookableCentre(pool, centreId);
  if (!centre || !centre.is_active || centre.verification_status !== 'verified') {
    throw AppError.notFound('Centre');
  }
  const windows = toWindows([q], now);
  const times = (await freeTimesFor(pool, [centreId], windows, now)).get(centreId) ?? [];
  return { centre_id: centreId, free_times: times.map(iso) };
}
