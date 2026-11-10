import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool, type Row } from '../src/db/pool.js';
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
  providerId?: number,
  start = inHours(24),
  end = inHours(25),
) =>
  api
    .post('/api/v1/appointments')
    .set(auth)
    .send({
      care_request_id: requestId,
      ...(providerId !== undefined ? { provider_id: providerId } : {}),
      starts_at: start,
      ends_at: end,
      appointment_type: 'assessment',
    });

describe('appointments', () => {
  it('cannot book before a provider has accepted the request', async () => {
    const patient = await makeUser('patient');
    const requestId = await makeRequest(patient);
    const r = await book(patient.auth, requestId);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('REQUEST_NOT_BOOKABLE');
  });

  it('patient books with the assigned provider; overlap returns 409 (not 500)', async () => {
    const { patient, providerId, requestId } = await acceptedRequest();
    const r = await book(patient.auth, requestId, providerId);
    expect(r.status).toBe(201);
    expect(r.body.data.provider_id).toBe(providerId);
    expect(await auditActions('appointment', r.body.data.id)).toEqual(['APPOINTMENT_BOOKED']);

    const clash = await book(patient.auth, requestId, providerId, inHours(24.5), inHours(25.5));
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('SLOT_UNAVAILABLE');
    // Back-to-back is fine, including when the client sends sub-second precision
    expect((await book(patient.auth, requestId, providerId, inHours(25), inHours(26))).status).toBe(
      201,
    );
    const msStart = new Date(new Date(inHours(26)).getTime() + 400).toISOString();
    expect((await book(patient.auth, requestId, providerId, msStart, inHours(27))).status).toBe(
      201,
    );
  });

  it('concurrent bookings for the same slot: exactly one wins', async () => {
    const { patient, providerId, requestId } = await acceptedRequest();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => book(patient.auth, requestId, providerId)),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
  });

  it('validates times', async () => {
    const { patient, requestId } = await acceptedRequest();
    const past = new Date(Date.now() - 3600_000).toISOString();
    expect((await book(patient.auth, requestId, undefined, past, inHours(1))).status).toBe(400);
    expect((await book(patient.auth, requestId, undefined, inHours(25), inHours(24))).status).toBe(
      400,
    );
    expect((await book(patient.auth, requestId, undefined, inHours(24), inHours(40))).status).toBe(
      400,
    );
    expect((await book(patient.auth, requestId, undefined, '2026-13-01', inHours(1))).status).toBe(
      400,
    );
  });

  it("other patients and non-member staff cannot book on someone's request", async () => {
    const { providerId, requestId } = await acceptedRequest();
    const other = await makeUser('patient');
    expect((await book(other.auth, requestId)).status).toBe(404);
    const outsider = await makeStaff(await makeProvider());
    expect((await book(outsider.auth, requestId, providerId)).status).toBe(403);
  });

  it('provider staff see their provider’s appointments and can confirm them', async () => {
    const { patient, staff, apptId } = await acceptedRequest();
    const mine = await api.get('/api/v1/appointments/mine').set(staff.auth);
    expect(mine.body.data.map((a: { id: number }) => a.id)).toEqual([apptId]);
    expect(
      (await api.post(`/api/v1/appointments/${apptId}/confirm`).set(patient.auth)).status,
    ).toBe(403);
    const c = await api.post(`/api/v1/appointments/${apptId}/confirm`).set(staff.auth);
    expect(c.body.data.status).toBe('confirmed');
  });

  it('scopes /appointments/mine to one clinic, and refuses a clinic the caller is not in', async () => {
    const mine = await acceptedRequest();
    const other = await acceptedRequest();

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
    const { patient, requestId } = await acceptedRequest();
    await api.post(`/api/v1/requests/${requestId}/cancel`).set(patient.auth);
    const [rows] = await pool.query<Row[]>('SELECT status FROM appointments');
    expect(rows.map((r) => r.status).sort()).toEqual(['cancelled']);
  });
});
