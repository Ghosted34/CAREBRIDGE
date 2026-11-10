import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool, type Row } from '../src/db/pool.js';
import {
  api,
  auditActions,
  makeProvider,
  makeRequest,
  makeStaff,
  makeUser,
  requestBody,
  resetDb,
} from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

describe('care requests', () => {
  it('creates a request and writes an audit entry', async () => {
    const patient = await makeUser('patient');
    const id = await makeRequest(patient);
    expect(await auditActions('care_request', id)).toEqual(['CARE_REQUEST_CREATED']);
    const mine = await api.get('/api/v1/requests/mine').set(patient.auth);
    expect(mine.body.data).toHaveLength(1);
  });

  it('redirects emergencies instead of queueing them', async () => {
    const patient = await makeUser('patient');
    const r = await api
      .post('/api/v1/requests')
      .set(patient.auth)
      .send(requestBody({ has_emergency_symptoms: true }));
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('EMERGENCY_REDIRECT');
    expect(r.body.error.message).toMatch(/112/);
    const [rows] = await pool.query<Row[]>('SELECT COUNT(*) AS n FROM care_requests');
    expect(rows[0]!.n).toBe(0);
  });

  it('requires the emergency question to be answered', async () => {
    const patient = await makeUser('patient');
    const { has_emergency_symptoms: _omit, ...body } = requestBody();
    const r = await api.post('/api/v1/requests').set(patient.auth).send(body);
    expect(r.status).toBe(400);
  });

  it('only patients can create requests', async () => {
    const staff = await makeUser('provider_staff');
    const r = await api.post('/api/v1/requests').set(staff.auth).send(requestBody());
    expect(r.status).toBe(403);
  });

  describe('queue', () => {
    it('provider staff with no provider membership see nothing (was a data leak)', async () => {
      const patient = await makeUser('patient');
      await makeRequest(patient);
      const loner = await makeUser('provider_staff');
      const r = await api.get('/api/v1/requests/queue').set(loner.auth);
      expect(r.status).toBe(200);
      expect(r.body.data).toEqual([]);
    });

    it('staff of an unverified provider see nothing', async () => {
      const patient = await makeUser('patient');
      await makeRequest(patient);
      const staff = await makeStaff(await makeProvider({ verified: false }));
      expect((await api.get('/api/v1/requests/queue').set(staff.auth)).body.data).toEqual([]);
    });

    it('members see requests matching their specialties and city, most urgent first', async () => {
      const patient = await makeUser('patient');
      const routine = await makeRequest(patient, { urgency: 'routine' });
      const urgent = await makeRequest(patient, { urgency: 'urgent' });
      await makeRequest(patient, { specialty: 'cardiology' });
      await makeRequest(patient, { preferred_city: 'Abuja' });
      const staff = await makeStaff(await makeProvider({ specialties: ['dentistry'] }));
      const r = await api.get('/api/v1/requests/queue').set(staff.auth);
      expect(r.body.data.map((x: { id: number }) => x.id)).toEqual([urgent, routine]);
    });

    it('operators see the whole queue; patients are forbidden', async () => {
      const patient = await makeUser('patient');
      await makeRequest(patient);
      await makeRequest(patient, { specialty: 'cardiology' });
      const operator = await makeUser('operator');
      expect((await api.get('/api/v1/requests/queue').set(operator.auth)).body.data).toHaveLength(
        2,
      );
      expect((await api.get('/api/v1/requests/queue').set(patient.auth)).status).toBe(403);
    });
  });

  describe('directed to a chosen clinic', () => {
    it('assigns the clinic straight away and tells only that clinic', async () => {
      const patient = await makeUser('patient');
      const providerId = await makeProvider();
      const staff = await makeStaff(providerId, 'owner');
      const other = await makeStaff(await makeProvider(), 'owner');

      const r = await api
        .post('/api/v1/requests')
        .set(patient.auth)
        .send(requestBody({ target_provider_id: providerId }));
      expect(r.status).toBe(201);
      expect(r.body.data.status).toBe('provider_accepted');

      const id = r.body.data.id as number;
      const [providers] = await pool.query<Row[]>(
        'SELECT display_name FROM providers WHERE id = ?',
        [providerId],
      );
      const detail = await api.get(`/api/v1/requests/${id}`).set(patient.auth);
      expect(detail.body.data).toMatchObject({
        assigned_provider_id: providerId,
        assigned_provider: providers[0]!.display_name,
      });
      expect(await auditActions('care_request', id)).toEqual([
        'CARE_REQUEST_CREATED',
        'CARE_REQUEST_ASSIGNED',
      ]);
      // The chosen clinic can book immediately; nobody else is told.
      expect((await api.get('/api/v1/requests/assigned').set(staff.auth)).body.data).toHaveLength(
        1,
      );
      expect((await api.get('/api/v1/requests/queue').set(staff.auth)).body.data).toEqual([]);
      const chosenInbox = await api.get('/api/v1/notifications').set(staff.auth);
      expect(chosenInbox.body.data.map((n: { type: string }) => n.type)).toContain(
        'request_directed',
      );
      expect((await api.get('/api/v1/notifications').set(other.auth)).body.data).toEqual([]);
    });

    it('refuses clinics that are unverified, elsewhere, or do not offer the specialty', async () => {
      const patient = await makeUser('patient');
      const pending = await makeProvider({ verified: false });
      const cardiology = await makeProvider({ specialties: ['cardiology'] });
      const abuja = await makeProvider({ city: 'Abuja' });

      for (const target_provider_id of [pending, cardiology, abuja, 999999]) {
        const r = await api
          .post('/api/v1/requests')
          .set(patient.auth)
          .send(requestBody({ target_provider_id }));
        expect(r.status, String(target_provider_id)).toBe(404);
        expect(r.body.error.code).toBe('NOT_FOUND');
      }
      const [rows] = await pool.query<Row[]>('SELECT COUNT(*) AS n FROM care_requests');
      expect(rows[0]!.n).toBe(0);
    });

    it('still redirects emergencies even when a clinic was chosen', async () => {
      const patient = await makeUser('patient');
      const providerId = await makeProvider();
      const r = await api
        .post('/api/v1/requests')
        .set(patient.auth)
        .send(requestBody({ target_provider_id: providerId, has_emergency_symptoms: true }));
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe('EMERGENCY_REDIRECT');
    });
  });

  it('hides a request from other patients and unrelated staff (404)', async () => {
    const owner = await makeUser('patient');
    const id = await makeRequest(owner);
    const other = await makeUser('patient');
    const staff = await makeStaff(await makeProvider());
    expect((await api.get(`/api/v1/requests/${id}`).set(owner.auth)).status).toBe(200);
    expect((await api.get(`/api/v1/requests/${id}`).set(other.auth)).status).toBe(404);
    expect((await api.get(`/api/v1/requests/${id}`).set(staff.auth)).status).toBe(404);
  });

  it('patient can cancel; cancelling twice is an invalid transition', async () => {
    const patient = await makeUser('patient');
    const id = await makeRequest(patient);
    const r = await api.post(`/api/v1/requests/${id}/cancel`).set(patient.auth);
    expect(r.body.data.status).toBe('cancelled');
    const again = await api.post(`/api/v1/requests/${id}/cancel`).set(patient.auth);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');
  });
});
