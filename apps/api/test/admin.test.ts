import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { api, auditActions, makeRequest, makeUser, PASSWORD, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

describe('admin onboarding', () => {
  it('full flow: create provider → verify → approve staff → link → staff sees the queue', async () => {
    const admin = await makeUser('admin');
    const patient = await makeUser('patient');
    await makeRequest(patient);

    const p = await api
      .post('/api/v1/admin/providers')
      .set(admin.auth)
      .send({
        legal_name: 'Yaba Dental Ltd',
        display_name: 'Yaba Dental',
        provider_type: 'clinic',
        registration_number: 'MDCN-123',
        address: 'Herbert Macaulay Way, Yaba',
        specialties: ['dentistry'],
      });
    expect(p.status).toBe(201);
    expect(p.body.data.verification_status).toBe('pending');
    const providerId = p.body.data.id;

    // Pending provider is not in the public directory yet
    expect((await api.get(`/api/v1/providers/${providerId}`)).status).toBe(404);
    await api
      .post(`/api/v1/admin/providers/${providerId}/verification`)
      .set(admin.auth)
      .send({ verification_status: 'verified' });
    expect((await api.get(`/api/v1/providers/${providerId}`)).status).toBe(200);

    const reg = await api.post('/api/v1/auth/register').send({
      full_name: 'Dr Yaba',
      email: 'dr@yaba.test',
      phone: '+2348099999999',
      password: PASSWORD,
      role: 'provider_staff',
    });
    const staffId = reg.body.data.id;
    const pending = await api.get('/api/v1/admin/users?status=pending').set(admin.auth);
    expect(pending.body.data.map((u: { id: number }) => u.id)).toEqual([staffId]);

    await api
      .post(`/api/v1/admin/users/${staffId}/status`)
      .set(admin.auth)
      .send({ status: 'active' });
    const link = await api
      .post(`/api/v1/admin/providers/${providerId}/members`)
      .set(admin.auth)
      .send({ user_id: staffId, provider_role: 'clinician' });
    expect(link.status).toBe(200);

    const login = await api
      .post('/api/v1/auth/login')
      .send({ email: 'dr@yaba.test', password: PASSWORD });
    const queue = await api
      .get('/api/v1/requests/queue')
      .set({ Authorization: `Bearer ${login.body.data.token}` });
    expect(queue.body.data).toHaveLength(1);

    expect(await auditActions('provider', providerId)).toEqual([
      'PROVIDER_CREATED',
      'PROVIDER_VERIFICATION_CHANGED',
      'PROVIDER_MEMBER_SET',
    ]);
  });

  it('only provider_staff accounts can be linked to providers', async () => {
    const admin = await makeUser('admin');
    const patient = await makeUser('patient');
    const p = await api
      .post('/api/v1/admin/providers')
      .set(admin.auth)
      .send({
        legal_name: 'X Ltd',
        display_name: 'X Clinic',
        provider_type: 'clinic',
        registration_number: 'R1',
        address: 'Somewhere in Lagos',
        specialties: ['dentistry'],
      });
    const r = await api
      .post(`/api/v1/admin/providers/${p.body.data.id}/members`)
      .set(admin.auth)
      .send({ user_id: patient.id, provider_role: 'owner' });
    expect(r.status).toBe(409);
  });

  it('admin endpoints are forbidden to everyone else; operators can read metrics', async () => {
    for (const role of ['patient', 'provider_staff', 'operator'] as const) {
      const u = await makeUser(role);
      expect((await api.get('/api/v1/admin/users').set(u.auth)).status).toBe(403);
    }
    const operator = await makeUser('operator');
    const m = await api.get('/api/v1/admin/metrics').set(operator.auth);
    expect(m.status).toBe(200);
    expect(m.body.data).toHaveProperty('open_care_requests');
  });

  it('admins cannot suspend themselves', async () => {
    const admin = await makeUser('admin');
    const r = await api
      .post(`/api/v1/admin/users/${admin.id}/status`)
      .set(admin.auth)
      .send({ status: 'suspended' });
    expect(r.status).toBe(409);
  });
});
