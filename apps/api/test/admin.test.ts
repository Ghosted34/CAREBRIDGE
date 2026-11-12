import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { api, auditActions, inHours, makeUser, PASSWORD, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

describe('admin onboarding', () => {
  it('full flow: create provider → verify → approve staff → link → centre + hours → patient finds and books it', async () => {
    const admin = await makeUser('admin');
    const patient = await makeUser('patient');

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
      accept_terms: true,
      accept_privacy: true,
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
      .send({ user_id: staffId, provider_role: 'owner' });
    expect(link.status).toBe(200);

    const login = await api
      .post('/api/v1/auth/login')
      .send({ email: 'dr@yaba.test', password: PASSWORD });
    const owner = { Authorization: `Bearer ${login.body.data.token}` };
    const centre = await api.post(`/api/v1/providers/${providerId}/centres`).set(owner).send({
      name: 'Yaba main',
      address_line: '12 Herbert Macaulay Way',
      city: 'Yaba',
      state: 'Lagos',
      postal_code: '101212',
    });
    expect(centre.status).toBe(200);
    const centreId = centre.body.data.id;
    const hours = await api
      .put(`/api/v1/providers/${providerId}/schedules`)
      .set(owner)
      .send({
        centre_id: centreId,
        schedules: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
          day_of_week: d,
          open_time: '09:00',
          close_time: '17:00',
          slot_duration_minutes: 30,
        })),
      });
    expect(hours.status).toBe(200);

    const day = inHours(48).slice(0, 10);
    const found = await api
      .post('/api/v1/search')
      .set(patient.auth)
      .send({
        problem: 'checkup',
        periods: [{ from_date: day, to_date: day, time_of_day: 'morning' }],
      });
    const hit = found.body.data.results.find(
      (r: { centre_id: number }) => r.centre_id === centreId,
    );
    expect(hit.free_times[0].starts_at).toBe(`${day}T08:00:00.000Z`); // 09:00 Lagos
    const booked = await api.post('/api/v1/appointments').set(patient.auth).send({
      centre_id: centreId,
      starts_at: hit.free_times[0].starts_at,
      problem: 'checkup',
      has_emergency_symptoms: false,
    });
    expect(booked.status).toBe(201);
    const inbox = await api.get('/api/v1/appointments/mine').set(owner);
    expect(inbox.body.data.map((a: { id: number }) => a.id)).toEqual([booked.body.data.id]);

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
