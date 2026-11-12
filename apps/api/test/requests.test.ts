import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import {
  acceptedRequest,
  api,
  auditActions,
  makeClinic,
  makeStaff,
  makeUser,
  resetDb,
} from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

/** Visits (care requests) are created by booking; these endpoints read and cancel them. */
describe('visits', () => {
  it('a booking creates a visit the patient can list and open', async () => {
    const { patient, requestId } = await acceptedRequest();
    expect(await auditActions('care_request', requestId)).toEqual(['CARE_REQUEST_CREATED']);
    const mine = await api.get('/api/v1/requests/mine').set(patient.auth);
    expect(mine.body.data.map((r: { id: number }) => r.id)).toEqual([requestId]);
    expect((await api.get(`/api/v1/requests/${requestId}`).set(patient.auth)).status).toBe(200);
  });

  it('is hidden (404) from other patients and other clinics, visible to its clinic', async () => {
    const { staff, requestId } = await acceptedRequest();
    const other = await makeUser('patient');
    const outsider = await makeStaff((await makeClinic()).providerId);
    expect((await api.get(`/api/v1/requests/${requestId}`).set(other.auth)).status).toBe(404);
    expect((await api.get(`/api/v1/requests/${requestId}`).set(outsider.auth)).status).toBe(404);
    expect((await api.get(`/api/v1/requests/${requestId}`).set(staff.auth)).status).toBe(200);
  });

  it('the patient can cancel once; cancelling twice is an invalid transition', async () => {
    const { patient, requestId } = await acceptedRequest();
    const r = await api.post(`/api/v1/requests/${requestId}/cancel`).set(patient.auth);
    expect(r.body.data.status).toBe('cancelled');
    const again = await api.post(`/api/v1/requests/${requestId}/cancel`).set(patient.auth);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('retired endpoints are gone: queue, matching, journey steps, direct request creation', async () => {
    const { patient, staff, requestId } = await acceptedRequest();
    // (/requests/queue now hits /requests/:id with a non-numeric id → 400; either way, no data)
    expect([400, 404]).toContain((await api.get('/api/v1/requests/queue').set(staff.auth)).status);
    expect([400, 404]).toContain(
      (await api.get('/api/v1/requests/assigned').set(staff.auth)).status,
    );
    expect((await api.get(`/api/v1/requests/${requestId}/matches`).set(patient.auth)).status).toBe(
      404,
    );
    expect(
      (await api.post(`/api/v1/requests/${requestId}/start-assessment`).set(staff.auth)).status,
    ).toBe(404);
    expect((await api.post('/api/v1/requests').set(patient.auth).send({})).status).toBe(404);
  });
});
