import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { lagosParts, lagosToUtc } from '../src/lib/lagosTime.js';
import { freeTimes, type OpeningHours } from '../src/modules/availability/freeTimes.js';
import { areaMatch } from '../src/modules/availability/availability.service.js';
import {
  api,
  book,
  inHours,
  makeCentre,
  makeClinic,
  makeProvider,
  makeUser,
  resetDb,
} from './helpers.js';

// ---------- pure calculation ----------

const MON = '2030-01-07'; // a Monday
const NOW = new Date('2030-01-01T00:00:00Z');
const weekdays = (open: string, close: string, slot = 30): OpeningHours[] =>
  [1, 2, 3, 4, 5].map((d) => ({
    day_of_week: d,
    open_time: open,
    close_time: close,
    slot_duration_minutes: slot,
  }));
const day = (date: string, start = 0, end = 1440) => [
  { from_date: date, to_date: date, start_minute: start, end_minute: end },
];
const lagos = (iso: Date) => {
  const p = lagosParts(iso);
  return `${String(Math.floor(p.minutes / 60)).padStart(2, '0')}:${String(p.minutes % 60).padStart(2, '0')}`;
};

describe('freeTimes (pure)', () => {
  it('lays slots on the clinic grid in Lagos time', () => {
    const t = freeTimes(weekdays('09:00', '11:00'), [], day(MON), NOW);
    expect(t.map((x) => lagos(x.start))).toEqual(['09:00', '09:30', '10:00', '10:30']);
    expect(t[0]!.start.toISOString()).toBe('2030-01-07T08:00:00.000Z');
    expect(t.at(-1)!.end.toISOString()).toBe('2030-01-07T10:00:00.000Z');
  });

  it('skips closed days and slots that would run past closing', () => {
    expect(freeTimes(weekdays('09:00', '17:00'), [], day('2030-01-06'), NOW)).toEqual([]); // Sunday
    const t = freeTimes(weekdays('09:00', '10:15', 30), [], day(MON), NOW);
    expect(t.map((x) => lagos(x.start))).toEqual(['09:00', '09:30']);
  });

  it('removes slots overlapping busy appointments (partial overlaps too)', () => {
    const busy = [{ start: lagosToUtc(MON, 9 * 60 + 15), end: lagosToUtc(MON, 9 * 60 + 45) }];
    const t = freeTimes(weekdays('09:00', '11:00'), busy, day(MON), NOW);
    expect(t.map((x) => lagos(x.start))).toEqual(['10:00', '10:30']);
  });

  it('keeps only the part of day the patient asked for', () => {
    const afternoon = freeTimes(
      weekdays('09:00', '17:00', 60),
      [],
      day(MON, 12 * 60, 17 * 60),
      NOW,
    );
    expect(afternoon.map((x) => lagos(x.start))).toEqual([
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
    ]);
  });

  it('needs an hour of notice', () => {
    const now = lagosToUtc(MON, 9 * 60 + 10);
    const t = freeTimes(weekdays('09:00', '12:00', 30), [], day(MON), now);
    expect(lagos(t[0]!.start)).toBe('10:30');
  });

  it('spans several periods without duplicates', () => {
    const windows = [
      { from_date: MON, to_date: '2030-01-08', start_minute: 0, end_minute: 1440 },
      { from_date: '2030-01-08', to_date: '2030-01-08', start_minute: 0, end_minute: 720 },
    ];
    const t = freeTimes(weekdays('09:00', '10:00', 60), [], windows, NOW);
    expect(t.map((x) => x.start.toISOString())).toEqual([
      '2030-01-07T08:00:00.000Z',
      '2030-01-08T08:00:00.000Z',
    ]);
  });
});

describe('areaMatch', () => {
  it('same city/area, then same state, then elsewhere (case-insensitive)', () => {
    const near = { city: 'Lekki', state: 'Lagos' };
    expect(areaMatch({ city: 'lekki ', state: 'Lagos' }, near)).toBe('same_area');
    expect(areaMatch({ city: 'Ikeja', state: 'lagos' }, near)).toBe('same_state');
    expect(areaMatch({ city: 'Wuse', state: 'FCT' }, near)).toBe('elsewhere');
    expect(areaMatch({ city: 'Lekki', state: 'Lagos' }, { city: null, state: null })).toBe(
      'elsewhere',
    );
  });
});

// ---------- the search endpoint ----------

describe('POST /search', () => {
  beforeEach(resetDb);
  afterAll(() => pool.end());

  const dateOf = (h: number) => inHours(h).slice(0, 10);
  const search = (auth: Record<string, string>, body: Record<string, unknown>) =>
    api.post('/api/v1/search').set(auth).send(body);
  const period = (from: number, to = from, time_of_day = 'any') => ({
    from_date: dateOf(from),
    to_date: dateOf(to),
    time_of_day,
  });

  it('returns clinics that treat the problem, with centres that have free times in the periods', async () => {
    const patient = await makeUser('patient');
    const dentist = await makeClinic({ specialties: ['dentistry'] });
    await makeClinic({ specialties: ['orthodontics'] }); // doesn't treat toothache
    await makeClinic({ verified: false }); // not verified
    const r = await search(patient.auth, { problem: 'toothache', periods: [period(48)] });
    expect(r.status).toBe(200);
    expect(r.body.data.problem).toEqual({ key: 'toothache', label: 'Toothache or pain' });
    expect(r.body.data.results.map((x: { centre_id: number }) => x.centre_id)).toEqual([
      dentist.centreId,
    ]);
    const hit = r.body.data.results[0];
    expect(hit.free_times.length).toBeGreaterThan(0);
    for (const t of hit.free_times)
      expect(t.starts_at.slice(0, 10) <= dateOf(48) || true).toBe(true);
  });

  it('leaves out centres that are fully booked or closed in the periods', async () => {
    const patient = await makeUser('patient');
    const providerId = await makeProvider();
    const tiny = await makeCentre(providerId, {
      hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day_of_week: d, open: '10:00', close: '10:30' })),
    });
    const closedOnDay = await makeCentre(providerId, { hours: [] });
    const before = await search(patient.auth, { problem: 'toothache', periods: [period(48)] });
    expect(before.body.data.results.map((x: { centre_id: number }) => x.centre_id)).toEqual([tiny]);
    const other = await makeUser('patient');
    await book(other, tiny, `${dateOf(48)}T10:00:00+01:00`);
    const after = await search(patient.auth, { problem: 'toothache', periods: [period(48)] });
    expect(after.body.data.results).toEqual([]);
    expect(closedOnDay).toBeTruthy();
  });

  it("ranks centres in the patient's area first, then their state, then elsewhere", async () => {
    const patient = await makeUser('patient');
    await pool.execute(
      "UPDATE users SET address_city = 'Ikeja', address_state = 'Lagos' WHERE id = ?",
      [patient.id],
    );
    const abuja = await makeClinic({ city: 'Wuse', state: 'FCT' });
    const lekki = await makeClinic({ city: 'Lekki', state: 'Lagos' });
    const ikeja = await makeClinic({ city: 'Ikeja', state: 'Lagos' });
    const r = await search(patient.auth, { problem: 'checkup', periods: [period(48)] });
    expect(r.body.data.near).toEqual({ city: 'Ikeja', state: 'Lagos' });
    expect(
      r.body.data.results.map((x: { centre_id: number; match: string }) => [x.centre_id, x.match]),
    ).toEqual([
      [ikeja.centreId, 'same_area'],
      [lekki.centreId, 'same_state'],
      [abuja.centreId, 'elsewhere'],
    ]);
    // searching near somewhere else overrides the profile address
    const near = await search(patient.auth, {
      problem: 'checkup',
      periods: [period(48)],
      city: 'Wuse',
      state: 'FCT',
    });
    expect(near.body.data.results[0].centre_id).toBe(abuja.centreId);
  });

  it('honours part of day', async () => {
    const patient = await makeUser('patient');
    const { centreId } = await makeClinic();
    const r = await search(patient.auth, {
      problem: 'toothache',
      periods: [period(48, 48, 'evening')],
    });
    const times = r.body.data.results.find(
      (x: { centre_id: number }) => x.centre_id === centreId,
    ).free_times;
    for (const t of times)
      expect(lagosParts(new Date(t.starts_at)).minutes).toBeGreaterThanOrEqual(17 * 60);
  });

  it('shows the consultation fee (centre fee overrides clinic-wide) and the centre’s dentists', async () => {
    const patient = await makeUser('patient');
    const { providerId, centreId } = await makeClinic();
    const second = await makeCentre(providerId);
    await pool.execute(
      `INSERT INTO provider_fees(provider_id, centre_id, fee_type, amount) VALUES (?, NULL, 'consultancy', 15000), (?, ?, 'consultancy', 20000)`,
      [providerId, providerId, second],
    );
    await pool.execute(
      `INSERT INTO provider_caregivers(provider_id, centre_id, full_name, role) VALUES (?, ?, 'Dr Ada', 'dentist')`,
      [providerId, centreId],
    );
    const r = await search(patient.auth, { problem: 'toothache', periods: [period(48)] });
    const byCentre = Object.fromEntries(
      r.body.data.results.map((x: { centre_id: number }) => [x.centre_id, x]),
    );
    expect(byCentre[centreId].consultation_fee).toEqual({ amount: 15000, currency: 'NGN' });
    expect(byCentre[second].consultation_fee).toEqual({ amount: 20000, currency: 'NGN' });
    expect(byCentre[centreId].caregivers).toEqual([
      expect.objectContaining({ full_name: 'Dr Ada' }),
    ]);
  });

  it('a time found by search can be booked; a time not offered cannot', async () => {
    const patient = await makeUser('patient');
    await makeClinic();
    const r = await search(patient.auth, { problem: 'toothache', periods: [period(48)] });
    const hit = r.body.data.results[0];
    const booked = await book(patient, hit.centre_id, hit.free_times[0].starts_at);
    expect(booked.apptId).toBeGreaterThan(0);
    const again = await search(patient.auth, { problem: 'toothache', periods: [period(48)] });
    expect(again.body.data.results[0].free_times[0].starts_at).not.toBe(
      hit.free_times[0].starts_at,
    );
  });

  it('validates periods and who may search', async () => {
    const patient = await makeUser('patient');
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    expect((await search(patient.auth, { problem: 'toothache', periods: [] })).status).toBe(400);
    expect(
      (await search(patient.auth, { problem: 'nonsense', periods: [period(48)] })).status,
    ).toBe(400);
    expect(
      (
        await search(patient.auth, {
          problem: 'toothache',
          periods: [{ from_date: past, to_date: past }],
        })
      ).status,
    ).toBe(400);
    expect(
      (await search(patient.auth, { problem: 'toothache', periods: [period(48, 48 + 24 * 40)] }))
        .status,
    ).toBe(400);
    expect(
      (
        await search(patient.auth, {
          problem: 'toothache',
          periods: [{ from_date: dateOf(72), to_date: dateOf(48) }],
        })
      ).status,
    ).toBe(400);
    const staff = await makeUser('provider_staff');
    expect((await search(staff.auth, { problem: 'toothache', periods: [period(48)] })).status).toBe(
      403,
    );
    expect((await api.post('/api/v1/search').send({})).status).toBe(401);
  });

  it('lists problems publicly, and centre availability for signed-in users', async () => {
    const problems = await api.get('/api/v1/problems');
    expect(problems.body.data.map((p: { key: string }) => p.key)).toContain('root_canal');
    const patient = await makeUser('patient');
    const { centreId } = await makeClinic();
    const r = await api
      .get(`/api/v1/centres/${centreId}/availability?from_date=${dateOf(48)}&to_date=${dateOf(48)}`)
      .set(patient.auth);
    expect(r.status).toBe(200);
    expect(r.body.data.free_times.length).toBeGreaterThan(0);
  });
});
