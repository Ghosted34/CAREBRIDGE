import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import {
  acceptedRequest,
  api,
  auditActions,
  completeVisit,
  inHours,
  makeProvider,
  makeRequest,
  makeStaff,
  makeUser,
  resetDb,
} from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

describe('assigned requests', () => {
  it('provider staff see requests assigned to their provider, with patient contact', async () => {
    const { staff, requestId } = await acceptedRequest();
    await acceptedRequest(); // someone else's
    const r = await api.get('/api/v1/requests/assigned').set(staff.auth);
    expect(r.status).toBe(200);
    expect(r.body.data.map((x: { id: number }) => x.id)).toEqual([requestId]);
    expect(r.body.data[0]).toHaveProperty('patient_name');
    expect(r.body.data[0]).toHaveProperty('patient_phone');
    // Drives the post-visit gating in the UI: nothing has happened in the clinic yet.
    expect(r.body.data[0].assessments_completed).toBe(0);
  });

  it('counts completed visits so the UI can gate estimates and referrals', async () => {
    const { patient, staff, requestId } = await acceptedRequest();
    await completeVisit(patient, staff, requestId);
    const r = await api.get('/api/v1/requests/assigned').set(staff.auth);
    expect(r.body.data[0]).toMatchObject({ id: requestId, assessments_completed: 1 });
  });

  it('scopes the list to one clinic, and refuses a clinic the caller is not a member of', async () => {
    const mine = await acceptedRequest();
    const other = await acceptedRequest();
    const scoped = await api
      .get(`/api/v1/requests/assigned?provider_id=${mine.providerId}`)
      .set(mine.staff.auth);
    expect(scoped.body.data.map((x: { id: number }) => x.id)).toEqual([mine.requestId]);
    // Denied case: another clinic's patients must not be reachable by guessing an id.
    const denied = await api
      .get(`/api/v1/requests/assigned?provider_id=${other.providerId}`)
      .set(mine.staff.auth);
    expect(denied.status).toBe(403);
    const operator = await makeUser('operator');
    expect(
      (
        await api
          .get(`/api/v1/requests/assigned?provider_id=${other.providerId}`)
          .set(operator.auth)
      ).body.data.map((x: { id: number }) => x.id),
    ).toEqual([other.requestId]);
  });

  it('staff without memberships see nothing; operators see all; patients are forbidden', async () => {
    const { patient } = await acceptedRequest();
    await acceptedRequest();
    expect(
      (await api.get('/api/v1/requests/assigned').set((await makeUser('provider_staff')).auth)).body
        .data,
    ).toEqual([]);
    expect(
      (await api.get('/api/v1/requests/assigned').set((await makeUser('operator')).auth)).body.data,
    ).toHaveLength(2);
    expect((await api.get('/api/v1/requests/assigned').set(patient.auth)).status).toBe(403);
  });
});

describe('journey progress', () => {
  it('clinician moves the request through assessment → plan → treatment → completed', async () => {
    const { patient, staff, providerId, requestId } = await acceptedRequest();
    const clinician = await makeStaff(providerId, 'clinician');
    const start = await api
      .post(`/api/v1/requests/${requestId}/start-assessment`)
      .set(clinician.auth);
    expect(start.status).toBe(200);
    expect(start.body.data.status).toBe('assessment');

    // Clinical governance: treatment planning and treatment follow a visit, never precede it.
    const tooEarly = await api
      .post(`/api/v1/requests/${requestId}/plan-treatment`)
      .set(clinician.auth);
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.error.code).toBe('VISIT_REQUIRED');

    await completeVisit(patient, staff, requestId);
    for (const [step, status] of [
      ['plan-treatment', 'treatment_planned'],
      ['start-treatment', 'in_progress'],
      ['complete', 'completed'],
    ]) {
      const r = await api.post(`/api/v1/requests/${requestId}/${step}`).set(clinician.auth);
      expect(r.status, step).toBe(200);
      expect(r.body.data.status).toBe(status);
    }
    expect(await auditActions('care_request', requestId)).toContain('CARE_REQUEST_COMPLETED');
  });

  it('a checked-in (not yet completed) appointment also unlocks treatment planning', async () => {
    const { patient, staff, requestId } = await acceptedRequest();
    await api.post(`/api/v1/requests/${requestId}/start-assessment`).set(staff.auth);
    const booked = await api
      .post('/api/v1/appointments')
      .set(patient.auth)
      .send({
        care_request_id: requestId,
        starts_at: inHours(24),
        ends_at: inHours(25),
        appointment_type: 'assessment',
      });
    await api.post(`/api/v1/appointments/${booked.body.data.id}/confirm`).set(staff.auth);
    expect(
      (await api.post(`/api/v1/requests/${requestId}/plan-treatment`).set(staff.auth)).status,
    ).toBe(409);
    await api.post(`/api/v1/appointments/${booked.body.data.id}/check-in`).set(staff.auth);
    expect(
      (await api.post(`/api/v1/requests/${requestId}/plan-treatment`).set(staff.auth)).status,
    ).toBe(200);
  });

  it('a cancelled appointment does not count as a visit', async () => {
    const { patient, staff, requestId } = await acceptedRequest();
    await api.post(`/api/v1/requests/${requestId}/start-assessment`).set(staff.auth);
    const booked = await api
      .post('/api/v1/appointments')
      .set(patient.auth)
      .send({
        care_request_id: requestId,
        starts_at: inHours(24),
        ends_at: inHours(25),
        appointment_type: 'assessment',
      });
    await api.post(`/api/v1/appointments/${booked.body.data.id}/cancel`).set(patient.auth);
    const r = await api.post(`/api/v1/requests/${requestId}/plan-treatment`).set(staff.auth);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('VISIT_REQUIRED');
  });

  it('assessment can complete directly; invalid jumps are 409', async () => {
    const { staff, requestId } = await acceptedRequest();
    expect(
      (await api.post(`/api/v1/requests/${requestId}/start-treatment`).set(staff.auth)).status,
    ).toBe(409);
    await api.post(`/api/v1/requests/${requestId}/start-assessment`).set(staff.auth);
    expect((await api.post(`/api/v1/requests/${requestId}/complete`).set(staff.auth)).status).toBe(
      200,
    );
  });

  it('schedulers, other providers and unassigned requests are refused', async () => {
    const { providerId, requestId } = await acceptedRequest();
    const scheduler = await makeStaff(providerId, 'scheduler');
    expect(
      (await api.post(`/api/v1/requests/${requestId}/start-assessment`).set(scheduler.auth)).status,
    ).toBe(403);
    const outsider = await makeStaff(await makeProvider(), 'owner');
    expect(
      (await api.post(`/api/v1/requests/${requestId}/start-assessment`).set(outsider.auth)).status,
    ).toBe(403);
    const patient = await makeUser('patient');
    const open = await makeRequest(patient);
    const operator = await makeUser('operator');
    expect(
      (await api.post(`/api/v1/requests/${open}/start-assessment`).set(operator.auth)).status,
    ).toBe(404);
  });
});

describe('offers/mine', () => {
  it('lists only offers made by the caller’s providers', async () => {
    const { staff, offerId } = await acceptedRequest();
    await acceptedRequest();
    const r = await api.get('/api/v1/offers/mine').set(staff.auth);
    expect(r.body.data.map((o: { id: number }) => o.id)).toEqual([offerId]);
    expect(r.body.data[0]).toMatchObject({
      status: 'accepted',
      request_status: 'provider_accepted',
    });
  });
});

describe('appointment provider actions', () => {
  it('confirm → check-in → complete; no-show only from confirmed', async () => {
    const { patient, staff, requestId } = await acceptedRequest();
    const a = await api
      .post('/api/v1/appointments')
      .set(patient.auth)
      .send({
        care_request_id: requestId,
        starts_at: inHours(1),
        ends_at: inHours(2),
        appointment_type: 'assessment',
      });
    const id = a.body.data.id;
    expect((await api.post(`/api/v1/appointments/${id}/no-show`).set(staff.auth)).status).toBe(409);
    for (const verb of ['confirm', 'check-in', 'complete']) {
      expect(
        (await api.post(`/api/v1/appointments/${id}/${verb}`).set(staff.auth)).status,
        verb,
      ).toBe(200);
    }
    expect((await api.post(`/api/v1/appointments/${id}/check-in`).set(patient.auth)).status).toBe(
      403,
    );
    const list = await api.get('/api/v1/appointments/mine').set(staff.auth);
    expect(list.body.data[0]).toMatchObject({
      status: 'completed',
      patient_name: expect.any(String),
    });
  });
});

describe('admin providers', () => {
  it('lists all providers (pending first) with member counts, and members of one provider', async () => {
    const admin = await makeUser('admin');
    const verified = await makeProvider();
    const pending = await makeProvider({ verified: false });
    const owner = await makeStaff(verified, 'owner');
    const r = await api.get('/api/v1/admin/providers').set(admin.auth);
    expect(r.body.data.map((p: { id: number }) => p.id)).toEqual([pending, verified]);
    expect(r.body.data[1].member_count).toBe(1);
    const filtered = await api
      .get('/api/v1/admin/providers?verification_status=pending')
      .set(admin.auth);
    expect(filtered.body.data).toHaveLength(1);
    const members = await api.get(`/api/v1/admin/providers/${verified}/members`).set(admin.auth);
    expect(members.body.data).toEqual([
      expect.objectContaining({ user_id: owner.id, provider_role: 'owner' }),
    ]);
  });

  it('operators can list providers but not members; staff cannot list providers', async () => {
    const operator = await makeUser('operator');
    const p = await makeProvider();
    expect((await api.get('/api/v1/admin/providers').set(operator.auth)).status).toBe(200);
    expect((await api.get(`/api/v1/admin/providers/${p}/members`).set(operator.auth)).status).toBe(
      403,
    );
    expect(
      (await api.get('/api/v1/admin/providers').set((await makeUser('provider_staff')).auth))
        .status,
    ).toBe(403);
  });
});
