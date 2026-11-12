import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool, type Row } from '../src/db/pool.js';
import {
  acceptedRequest,
  api,
  auditActions,
  book,
  bookingBody,
  inHours,
  makeCentre,
  makeClinic,
  makeProvider,
  makeStaff,
  makeUser,
  resetDb,
} from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

const post = (auth: Record<string, string>, body: Record<string, unknown>) =>
  api.post('/api/v1/appointments').set(auth).send(body);

describe('booking a free time at a centre', () => {
  it('creates a requested appointment and its visit; the server sets the end time from the slot length', async () => {
    const patient = await makeUser('patient');
    const { providerId, centreId } = await makeClinic();
    const r = await post(
      patient.auth,
      bookingBody(centreId, inHours(5), { details: 'Pain on the left' }),
    );
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({
      provider_id: providerId,
      centre_id: centreId,
      status: 'requested',
      starts_at: inHours(5).replace('.000Z', '.000Z'),
      ends_at: inHours(5.5),
    });
    const [visits] = await pool.query<Row[]>(
      'SELECT status, assigned_provider_id, service_type, description FROM care_requests',
    );
    expect(visits[0]).toEqual({
      status: 'provider_accepted',
      assigned_provider_id: providerId,
      service_type: 'Toothache or pain',
      description: 'Pain on the left',
    });
    expect(await auditActions('appointment', r.body.data.id)).toEqual(['APPOINTMENT_REQUESTED']);
  });

  it('refuses a time that is outside opening hours, off the slot grid, or in the past', async () => {
    const patient = await makeUser('patient');
    const providerId = await makeProvider();
    // Open Mon–Sun 09:00–17:00 Lagos, 30-minute slots
    const centreId = await makeCentre(providerId, {
      hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day_of_week: d, open: '09:00', close: '17:00' })),
    });
    const day = inHours(48).slice(0, 10); // a Lagos date two days out
    const at = (hhmm: string) => `${day}T${hhmm}:00+01:00`;
    const outside = await post(patient.auth, bookingBody(centreId, at('03:17')));
    expect(outside.status).toBe(409);
    expect(outside.body.error.code).toBe('SLOT_UNAVAILABLE');
    expect((await post(patient.auth, bookingBody(centreId, at('09:10')))).status).toBe(409); // off grid
    expect((await post(patient.auth, bookingBody(centreId, at('16:45')))).status).toBe(409); // runs past close
    expect((await post(patient.auth, bookingBody(centreId, at('09:00')))).status).toBe(201);
    const past = await post(
      patient.auth,
      bookingBody(centreId, new Date(Date.now() - 3600_000).toISOString()),
    );
    expect(past.status).toBe(400);
  });

  it('opening hours are Lagos time: 09:00 opening = 08:00 UTC (regression)', async () => {
    const patient = await makeUser('patient');
    const providerId = await makeProvider();
    const centreId = await makeCentre(providerId, {
      hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day_of_week: d, open: '09:00', close: '10:00' })),
    });
    const day = inHours(48).slice(0, 10);
    const r = await post(patient.auth, bookingBody(centreId, `${day}T08:00:00Z`));
    expect(r.status).toBe(201);
    expect((await post(patient.auth, bookingBody(centreId, `${day}T09:30:00Z`))).status).toBe(409); // 10:30 Lagos
  });

  it('one appointment at a time per centre — but two centres of one clinic are independent', async () => {
    const p1 = await makeUser('patient');
    const p2 = await makeUser('patient');
    const p3 = await makeUser('patient');
    const { providerId, centreId } = await makeClinic();
    const second = await makeCentre(providerId, { name: 'Ikoyi branch' });
    await book(p1, centreId, inHours(10));
    const clash = await post(p2.auth, bookingBody(centreId, inHours(10)));
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('SLOT_UNAVAILABLE');
    expect((await post(p3.auth, bookingBody(second, inHours(10)))).status).toBe(201);
  });

  it('concurrent requests for the same time at one centre: exactly one wins', async () => {
    const { centreId } = await makeClinic();
    const patients = await Promise.all(Array.from({ length: 5 }, () => makeUser('patient')));
    const results = await Promise.all(
      patients.map((p) => post(p.auth, bookingBody(centreId, inHours(12)))),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
  });

  it('a declined or cancelled request frees the time again', async () => {
    const { patient, staff, centreId, apptId } = await acceptedRequest();
    const other = await makeUser('patient');
    expect((await post(other.auth, bookingBody(centreId, inHours(2)))).status).toBe(409);
    await api.post(`/api/v1/appointments/${apptId}/decline`).set(staff.auth);
    expect((await post(other.auth, bookingBody(centreId, inHours(2)))).status).toBe(201);
    expect(patient).toBeTruthy();
  });

  it('stores the requested caregiver, but only one who works at that centre', async () => {
    const patient = await makeUser('patient');
    const { providerId, centreId } = await makeClinic();
    const otherCentre = await makeCentre(providerId);
    const [cg] = await pool.query<Row[]>(
      `INSERT INTO provider_caregivers(provider_id, centre_id, full_name, role) VALUES (?, ?, 'Dr Bisi', 'dentist')`,
      [providerId, centreId],
    );
    const [elsewhere] = await pool.query<Row[]>(
      `INSERT INTO provider_caregivers(provider_id, centre_id, full_name, role) VALUES (?, ?, 'Dr Femi', 'dentist')`,
      [providerId, otherCentre],
    );
    const caregiverId = (cg as unknown as { insertId: number }).insertId;
    const wrong = (elsewhere as unknown as { insertId: number }).insertId;
    expect(
      (await post(patient.auth, bookingBody(centreId, inHours(3), { caregiver_id: 999 }))).status,
    ).toBe(404);
    expect(
      (await post(patient.auth, bookingBody(centreId, inHours(3), { caregiver_id: wrong }))).status,
    ).toBe(404);
    const ok = await post(
      patient.auth,
      bookingBody(centreId, inHours(3), { caregiver_id: caregiverId }),
    );
    expect(ok.status).toBe(201);
    const mine = await api.get('/api/v1/appointments/mine').set(patient.auth);
    expect(mine.body.data[0]).toMatchObject({
      caregiver_id: caregiverId,
      caregiver_name: 'Dr Bisi',
    });
  });

  it('records physical vs remote', async () => {
    const patient = await makeUser('patient');
    const { centreId } = await makeClinic();
    await book(patient, centreId, inHours(4), { appointment_mode: 'remote' });
    const mine = await api.get('/api/v1/appointments/mine').set(patient.auth);
    expect(mine.body.data[0].appointment_mode).toBe('remote');
  });

  it('refuses a clinic that does not treat the problem, and unverified clinics', async () => {
    const patient = await makeUser('patient');
    const { centreId } = await makeClinic({ specialties: ['orthodontics'] });
    const r = await post(patient.auth, bookingBody(centreId, inHours(3), { problem: 'toothache' }));
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('NOT_A_MATCH');
    expect(
      (await post(patient.auth, bookingBody(centreId, inHours(3), { problem: 'braces' }))).status,
    ).toBe(201);
    const pending = await makeClinic({ verified: false });
    expect((await post(patient.auth, bookingBody(pending.centreId, inHours(3)))).status).toBe(404);
  });

  it('emergency symptoms are redirected and nothing is stored', async () => {
    const patient = await makeUser('patient');
    const { centreId } = await makeClinic();
    const r = await post(
      patient.auth,
      bookingBody(centreId, inHours(3), { has_emergency_symptoms: true }),
    );
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('EMERGENCY_REDIRECT');
    const [rows] = await pool.query<Row[]>('SELECT COUNT(*) AS n FROM appointments');
    expect(rows[0]!.n).toBe(0);
  });

  it('a new visit must answer the emergency question and name a problem', async () => {
    const patient = await makeUser('patient');
    const { centreId } = await makeClinic();
    const { has_emergency_symptoms: _h, ...noAnswer } = bookingBody(centreId, inHours(3));
    expect((await post(patient.auth, noAnswer)).status).toBe(400);
    const { problem: _p, ...noProblem } = bookingBody(centreId, inHours(3));
    expect((await post(patient.auth, noProblem)).status).toBe(400);
  });

  it('follow-ups: same clinic only, on an open visit; clinic staff may book them for the patient', async () => {
    const { patient, staff, providerId, centreId, requestId } = await acceptedRequest();
    const followUp = { centre_id: centreId, starts_at: inHours(30), care_request_id: requestId };
    const byStaff = await post(staff.auth, followUp);
    expect(byStaff.status).toBe(201);
    const [appt] = await pool.query<Row[]>(
      'SELECT appointment_type, status FROM appointments WHERE id = ?',
      [byStaff.body.data.id],
    );
    expect(appt[0]!.appointment_type).toBe('follow_up');
    // the clinic chose the time, so it doesn't wait in its own "to confirm" list
    expect(appt[0]!.status).toBe('confirmed');
    expect(byStaff.body.data.status).toBe('confirmed');
    // a different clinic can't be used for a follow-up
    const other = await makeClinic();
    const wrongClinic = await post(patient.auth, {
      ...followUp,
      centre_id: other.centreId,
      starts_at: inHours(31),
    });
    expect(wrongClinic.status).toBe(409);
    // another clinic's staff can't book on this visit
    const outsider = await makeStaff(other.providerId);
    expect((await post(outsider.auth, { ...followUp, starts_at: inHours(32) })).status).toBe(404);
    // staff can't start a brand-new visit for someone
    expect((await post(staff.auth, bookingBody(centreId, inHours(33)))).status).toBe(400);
    expect(providerId).toBeTruthy();
  });

  it("other patients can't book on someone else's visit", async () => {
    const { centreId, requestId } = await acceptedRequest();
    const stranger = await makeUser('patient');
    const r = await post(stranger.auth, {
      centre_id: centreId,
      starts_at: inHours(40),
      care_request_id: requestId,
    });
    expect(r.status).toBe(404);
  });
});

describe('clinic actions on a booking request', () => {
  it('confirm → check-in → complete; no-show only from confirmed; patients cannot do clinic actions', async () => {
    const { patient, staff, apptId } = await acceptedRequest();
    expect(
      (await api.post(`/api/v1/appointments/${apptId}/confirm`).set(patient.auth)).status,
    ).toBe(403);
    expect((await api.post(`/api/v1/appointments/${apptId}/no-show`).set(staff.auth)).status).toBe(
      409,
    );
    for (const verb of ['confirm', 'check-in', 'complete']) {
      const r = await api.post(`/api/v1/appointments/${apptId}/${verb}`).set(staff.auth);
      expect(r.status, verb).toBe(200);
    }
  });

  it('staff of another clinic cannot act on the booking', async () => {
    const { apptId } = await acceptedRequest();
    const outsider = await makeStaff((await makeClinic()).providerId);
    expect(
      (await api.post(`/api/v1/appointments/${apptId}/confirm`).set(outsider.auth)).status,
    ).toBe(403);
  });

  it('lists: patients see their own, staff see their clinic’s, and a clinic they are not in is refused', async () => {
    const a = await acceptedRequest();
    const b = await acceptedRequest();
    const mineA = await api.get('/api/v1/appointments/mine').set(a.patient.auth);
    expect(mineA.body.data.map((x: { id: number }) => x.id)).toEqual([a.apptId]);
    const staffA = await api.get('/api/v1/appointments/mine').set(a.staff.auth);
    expect(staffA.body.data.map((x: { id: number }) => x.id)).toEqual([a.apptId]);
    expect(staffA.body.data[0]).toHaveProperty('centre_name');
    const refused = await api
      .get(`/api/v1/appointments/mine?provider_id=${b.providerId}`)
      .set(a.staff.auth);
    expect(refused.status).toBe(403);
  });

  it('cancelling the visit cancels its bookings and frees the time', async () => {
    const { patient, centreId, requestId } = await acceptedRequest();
    const r = await api.post(`/api/v1/requests/${requestId}/cancel`).set(patient.auth);
    expect(r.body.data.status).toBe('cancelled');
    const [rows] = await pool.query<Row[]>('SELECT status FROM appointments');
    expect(rows.map((x) => x.status)).toEqual(['cancelled']);
    const other = await makeUser('patient');
    expect((await post(other.auth, bookingBody(centreId, inHours(2)))).status).toBe(201);
  });
});
