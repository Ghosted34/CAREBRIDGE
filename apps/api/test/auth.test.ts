import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { api, makeUser, PASSWORD, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

const reg = (over: Record<string, unknown> = {}) => ({
  full_name: 'Ada Lovelace',
  email: 'Ada@Example.com',
  phone: '+2348012345678',
  password: 'long-enough-pw',
  accept_terms: true,
  accept_privacy: true,
  ...over,
});

describe('auth', () => {
  it('registers an active patient and logs in with a case-insensitive email', async () => {
    const r = await api.post('/api/v1/auth/register').send(reg());
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ role: 'patient', status: 'active' });
    const login = await api
      .post('/api/v1/auth/login')
      .send({ email: 'ada@example.com', password: 'long-enough-pw' });
    expect(login.status).toBe(200);
    expect(login.body.data.token).toBeTypeOf('string');
    expect(login.body.data.user).not.toHaveProperty('password_hash');
  });

  it('registers provider staff as pending, and pending accounts cannot log in', async () => {
    const r = await api.post('/api/v1/auth/register').send(reg({ role: 'provider_staff' }));
    expect(r.body.data.status).toBe('pending');
    const login = await api
      .post('/api/v1/auth/login')
      .send({ email: 'ada@example.com', password: 'long-enough-pw' });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_NOT_ACTIVE');
  });

  it('cannot self-register as admin or operator', async () => {
    const r = await api.post('/api/v1/auth/register').send(reg({ role: 'admin' }));
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(r.body.error.details.fieldErrors.role).toBeDefined();
  });

  it('rejects duplicate email/phone with 409', async () => {
    await api.post('/api/v1/auth/register').send(reg());
    const r = await api.post('/api/v1/auth/register').send(reg());
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('ALREADY_REGISTERED');
  });

  it('gives the same 401 for unknown email and wrong password', async () => {
    const u = await makeUser('patient');
    const [row] = (await pool.query('SELECT email FROM users WHERE id = ?', [u.id]))[0] as {
      email: string;
    }[];
    const wrong = await api
      .post('/api/v1/auth/login')
      .send({ email: row!.email, password: 'nope-nope' });
    const unknown = await api
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@test.local', password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('GET /me requires a token and returns the profile', async () => {
    expect((await api.get('/api/v1/me')).status).toBe(401);
    const u = await makeUser('patient');
    const me = await api.get('/api/v1/me').set(u.auth);
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ id: u.id, role: 'patient' });
  });

  it('a suspended user is locked out immediately, even with a valid token', async () => {
    const u = await makeUser('patient');
    await pool.execute(`UPDATE users SET status = 'suspended' WHERE id = ?`, [u.id]);
    const me = await api.get('/api/v1/me').set(u.auth);
    expect(me.status).toBe(403);
  });

  it('returns structured 400 for malformed JSON and 404 for unknown routes', async () => {
    const bad = await api
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_JSON');
    const missing = await api.get('/api/v1/nope');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });
});

describe('pasted emails', () => {
  it('ignores invisible characters copied from chat apps', async () => {
    await api.post('/api/v1/auth/register').send(reg());
    const r = await api
      .post('/api/v1/auth/login')
      .send({ email: '\u200Bada@example.com\u200B', password: 'long-enough-pw' });
    expect(r.status).toBe(200);
  });
});
