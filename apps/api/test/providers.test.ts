import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { api, makeProvider, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

describe('provider directory', () => {
  it('lists only verified providers offering the specialty in the city', async () => {
    const ok = await makeProvider();
    await makeProvider({ verified: false });
    await makeProvider({ specialties: ['cardiology'] });
    await makeProvider({ city: 'Abuja' });
    const r = await api.get('/api/v1/providers?specialty=dentistry&city=lagos');
    expect(r.status).toBe(200);
    expect(r.body.data.map((p: { id: number }) => p.id)).toEqual([ok]);
    expect(r.body.meta).toMatchObject({ limit: 50, offset: 0, count: 1 });
    expect(r.body.data[0]).not.toHaveProperty('registration_number');
    expect(r.body.data[0].accepting_referrals).toBe(true);
    const one = await api.get(`/api/v1/providers/${ok}`);
    expect(one.body.data.accepting_referrals).toBe(true);
  });

  it('hides unverified providers by id', async () => {
    const pending = await makeProvider({ verified: false });
    expect((await api.get(`/api/v1/providers/${pending}`)).status).toBe(404);
    expect((await api.get('/api/v1/providers/abc')).status).toBe(400);
  });
});
