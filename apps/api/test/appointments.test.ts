import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool, type Result, type Row } from '../src/db/pool.js';
import {
  acceptedRequest,
  api,
  auditActions,
  inHours,
  makeProvider,
  makeRequest,
  makeStaff,
  makeUser,
  resetDb,
} from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

const book = (
  auth: Record<string, string>,
  requestId: number,
  centreId: number,
  start = inHours(24),
  end = inHours(25),
) =>
  api.post('/api/v1/appointments').set(auth).send({
    care_request_id: requestId,
    starts_at: start,
    ends_at: end,
    appointment_type: 'assessment',
    centre_id: centreId,
  });

describe('appointments', () => {
  it('cannot book before a provider has accepted the request', async () => {
    const patient = await makeUser('patient');
    const requestId = await makeRequest(patient);
    const providerId = await makeProvider();
    const centreId = await (async () => {
      const [r] = await pool.execute<Result>(
        `INSERT INTO provider_centres(provider_id, name, address, city, is_active)
         VALUES (?, 'Test Centre', 'Test address, Lagos', TRUE)`,
        [providerId],
      );
      return r.insertId;
    })();
    const r = await book(patient.auth, requestId, centreId);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('REQUEST_NOT_BOOKABLE');
  });

  it('patient books with the assigned provider at one of its centres; overlap returns 409 (not 500)', async () => {
    const { patient, providerId, requestId, centreId } = await acceptedRequest();
    const r = await book(patient.auth, requestId, centreId);
    expect(r.status).toBe(201);
    expect(r.body.data.provider_id).toBe(providerId);
    expect(r.body.data.centre_id).toBe(centreId);
    expect(r.body.data.appointment_mode).toBe('physical');
    expect(await auditActions('appointment', r.body.data.id)).toEqual(['APPOINTMENT_BOOKED']);

    const clash = await book(patient.auth, requestId, centreId, inHours(24.5), inHours(25.5));
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('SLOT_UNAVAILABLE');
    // Back-to-back is fine, including when the client sends sub-second precision
    expect((await book(patient.auth, requestId, centreId, inHours(25), inHours(26))).status).toBe(
      201,
    );
    const msStart = new Date(new Date(inHours(26)).getTime() + 400).toISOString();
    expect((await book(patient.auth, requestId, centreId, msStart, inHours(27))).status).toBe(201);
  });

  it('concurrent bookings for the same slot: exactly one wins', async () => {
    const { patient, requestId, centreId } = await acceptedRequest();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => book(patient.auth, requestId, centreId)),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
  });

  it('validates times', async () => {
    const { patient, requestId, centreId } = await acceptedRequest();
    const past = new Date(Date.now() - 3600_000).toISOString();
    expect((await book(patient.auth, requestId, centreId, past, inHours(1))).status).toBe(400);
    expect((await book(patient.auth, requestId, centreId, inHours(25), inHours(24))).status).toBe(
      400,
    );
    expect((await book(patient.auth, requestId, centreId, inHours(24), inHours(40))).status).toBe(
      400,
    );
    expect((await book(patient.auth, requestId, centreId, '2026-13-01', inHours(1))).status).toBe(
      400,
    );
  });

  it("other patients and non-member staff cannot book on someone's request", async () => {
    const { requestId, centreId } = await acceptedRequest();
    const other = await makeUser('patient');
    expect((await book(other.auth, requestId, centreId)).status).toBe(404);
    // outsider is a member of a different provider → not allowed on this request
    const outsider = await makeStaff(await makeProvider());
    expect((await book(outsider.auth, requestId, centreId)).status).toBe(403);
  });

  it('refuses a centre that does not belong to the assigned provider', async () => {
    const { patient, requestId } = await acceptedRequest();
    const otherCentre = await (async () => {
      const [r] = await pool.execute<Result>(
        `INSERT INTO provider_centres(provider_id, name, address, city, is_active)
         VALUES (?, 'Other Centre', 'Other address, Lagos', TRUE)`,
        [await makeProvider()],
      );
      return r.insertId;
    })();
    const r = await book(patient.auth, requestId, otherCentre);
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
  });

  it('books a remote video-call appointment with a chosen caregiver', async () => {
    const { patient, providerId, staff, requestId, centreId } = await acceptedRequest();
    const caregiver = await makeUser('provider_staff');
    await pool.execute(
      "INSERT INTO provider_users(provider_id, user_id, provider_role) VALUES (?, ?, 'clinician')",
      [providerId, caregiver.id],
    );
    await pool.execute(
      `INSERT INTO provider_caregivers(provider_id, centre_id, user_id, is_active)
       VALUES (?, ?, ?, TRUE)`,
      [providerId, centreId, caregiver.id],
    );
    const r = await api
      .post('/api/v1/appointments')
      .set(patient.auth)
      .send({
        care_request_id: requestId,
        starts_at: inHours(24),
        ends_at: inHours(25),
        appointment_type: 'assessment',
        centre_id: centreId,
        caregiver_user_id: caregiver.id,
        appointment_mode: 'video_call',
      });
    expect(r.status).toBe(201);
    const [apptRows] = await pool.execute<Row[]>(
      `SELECT appointment_mode, caregiver_user_id, centre_id FROM appointments WHERE id = ?`,
      [r.body.data.id],
    );
    expect(apptRows[0]?.appointment_mode).toBe('video_call');
    expect(apptRows[0]?.caregiver_user_id).toBe(caregiver.id);
    expect(apptRows[0]?.centre_id).toBe(centreId);

    // Staff of the provider can see it in their diary
    const mine = await api.get('/api/v1/appointments/mine').set(staff.auth);
    expect(mine.body.data.map((a: { id: number }) => a.id)).toEqual([r.body.data.id]);
  });

  it('refuses a caregiver who is not active at that centre', async () => {
    const { patient, requestId, centreId } = await acceptedRequest();
    const outsider = await makeStaff(await makeProvider(), 'clinician');
    const r = await api
      .post('/api/v1/appointments')
      .set(patient.auth)
      .send({
        care_request_id: requestId,
        starts_at: inHours(24),
        ends_at: inHours(25),
        appointment_type: 'assessment',
        centre_id: centreId,
        caregiver_user_id: outsider.id,
      });
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
  });

  it('provider staff see their provider’s appointments and can confirm them', async () => {
    const { patient, staff, requestId, centreId } = await acceptedRequest();
    const { body } = await book(patient.auth, requestId, centreId);
    const mine = await api.get('/api/v1/appointments/mine').set(staff.auth);
    expect(mine.body.data.map((a: { id: number }) => a.id)).toEqual([body.data.id]);
    expect(
      (await api.post(`/api/v1/appointments/${body.data.id}/confirm`).set(patient.auth)).status,
    ).toBe(403);
    const c = await api.post(`/api/v1/appointments/${body.data.id}/confirm`).set(staff.auth);
    expect(c.body.data.status).toBe('confirmed');
  });

  it('scopes /appointments/mine to one clinic, and refuses a clinic the caller is not in', async () => {
    const mine = await acceptedRequest();
    const other = await acceptedRequest();
    await book(mine.patient.auth, mine.requestId, mine.centreId);
    await book(other.patient.auth, other.requestId, other.centreId);

    const scoped = await api
      .get(`/api/v1/appointments/mine?provider_id=${mine.providerId}`)
      .set(mine.staff.auth);
    expect(scoped.body.data).toHaveLength(1);
    expect(scoped.body.data[0].provider_id).toBe(mine.providerId);
    // Denied case: another clinic's diary is not reachable by guessing a provider id.
    expect(
      (
        await api
          .get(`/api/v1/appointments/mine?provider_id=${other.providerId}`)
          .set(mine.staff.auth)
      ).status,
    ).toBe(403);
    // Patients are scoped to themselves whatever they ask for.
    const asPatient = await api
      .get(`/api/v1/appointments/mine?provider_id=${mine.providerId}`)
      .set(mine.patient.auth);
    expect(asPatient.body.data).toHaveLength(1);
    expect(asPatient.body.data[0].patient_name).toBeTypeOf('string');
    const operator = await makeUser('operator');
    expect(
      (
        await api
          .get(`/api/v1/appointments/mine?provider_id=${other.providerId}`)
          .set(operator.auth)
      ).body.data,
    ).toHaveLength(1);
  });

  it('cancelling the request expires offers and cancels active appointments', async () => {
    const { patient, requestId, centreId } = await acceptedRequest();
    await book(patient.auth, requestId, centreId);
    await api.post(`/api/v1/requests/${requestId}/cancel`).set(patient.auth);
    const [rows] = await pool.query<Row[]>('SELECT status FROM appointments');
    expect(rows.map((r) => r.status)).toEqual(['cancelled']);
  });
});
