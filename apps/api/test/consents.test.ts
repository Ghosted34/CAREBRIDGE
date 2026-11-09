import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool, type Row } from '../src/db/pool.js';
import { POLICIES } from '../src/modules/consents/policies.js';
import {
  acceptedRequest,
  api,
  makeProvider,
  makeRequest,
  makeStaff,
  makeUser,
  requestBody,
  resetDb,
} from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

const register = (over: Record<string, unknown> = {}) =>
  api.post('/api/v1/auth/register').send({
    full_name: 'Bisi Patient',
    email: 'bisi@test.local',
    phone: '+2348011112222',
    password: 'long-enough-pw',
    accept_terms: true,
    accept_privacy: true,
    ...over,
  });

async function consentRows(userId: number) {
  const [rows] = await pool.query<Row[]>(
    'SELECT consent_type, version, granted, source, revoked_at FROM user_consents WHERE user_id = ? ORDER BY id',
    [userId],
  );
  return rows;
}

describe('consent at registration', () => {
  it('requires terms and privacy to be accepted', async () => {
    const r = await register({ accept_terms: false });
    expect(r.status).toBe(400);
    expect(r.body.error.details.fieldErrors.accept_terms).toBeDefined();
    expect((await register({ accept_privacy: undefined })).status).toBe(400);
  });

  it('records terms + privacy (and optional marketing) with version and source', async () => {
    const r = await register({ marketing_opt_in: true });
    expect(r.status).toBe(201);
    const rows = await consentRows(r.body.data.id);
    expect(rows.map((x) => [x.consent_type, x.version, x.granted, x.source])).toEqual([
      ['terms', POLICIES.terms.version, true, 'registration'],
      ['privacy', POLICIES.privacy.version, true, 'registration'],
      ['marketing', POLICIES.marketing.version, true, 'registration'],
    ]);
  });

  it('a failed registration records no consents (same transaction)', async () => {
    await register();
    await register({ email: 'other@test.local' }); // duplicate phone → 409
    const [rows] = await pool.query<Row[]>('SELECT COUNT(*) AS n FROM user_consents');
    expect(rows[0]!.n).toBe(2);
  });
});

describe('consent endpoints', () => {
  it('lists public policies', async () => {
    const r = await api.get('/api/v1/consents/policies');
    expect(r.status).toBe(200);
    expect(r.body.data.map((p: { type: string }) => p.type)).toEqual([
      'terms',
      'privacy',
      'data_sharing',
      'marketing',
    ]);
  });

  it('shows my status against current versions', async () => {
    const u = await makeUser('patient', 'active', { consents: false });
    await pool.execute(
      `INSERT INTO user_consents(user_id, consent_type, version, granted, source) VALUES (?, 'terms', 'old-version', TRUE, 'registration')`,
      [u.id],
    );
    const r = await api.get('/api/v1/consents').set(u.auth);
    const terms = r.body.data.find((c: { type: string }) => c.type === 'terms');
    expect(terms).toMatchObject({
      granted: true,
      granted_version: 'old-version',
      up_to_date: false,
    });
  });

  it('terms and privacy cannot be withdrawn while holding an account', async () => {
    const u = await makeUser('patient');
    const r = await api
      .post('/api/v1/consents')
      .set(u.auth)
      .send({ consent_type: 'terms', granted: false });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('CONSENT_NOT_REVOCABLE');
  });
});

describe('consent enforcement on care requests', () => {
  it('a patient without data-sharing consent is told exactly what is missing', async () => {
    const u = await makeUser('patient', 'active', { consents: false });
    await pool.execute(
      `INSERT INTO user_consents(user_id, consent_type, version, granted, source) VALUES (?, 'terms', ?, TRUE, 'registration'), (?, 'privacy', ?, TRUE, 'registration')`,
      [u.id, POLICIES.terms.version, u.id, POLICIES.privacy.version],
    );
    const r = await api.post('/api/v1/requests').set(u.auth).send(requestBody());
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({
      code: 'CONSENT_REQUIRED',
      details: { missing: ['data_sharing'] },
    });

    await api
      .post('/api/v1/consents')
      .set(u.auth)
      .send({ consent_type: 'data_sharing', granted: true, source: 'request_form' });
    expect((await api.post('/api/v1/requests').set(u.auth).send(requestBody())).status).toBe(201);
  });

  it('an outdated policy version blocks new requests until re-accepted', async () => {
    const u = await makeUser('patient');
    await pool.execute(
      `UPDATE user_consents SET version = 'old' WHERE user_id = ? AND consent_type = 'privacy'`,
      [u.id],
    );
    const r = await api.post('/api/v1/requests').set(u.auth).send(requestBody());
    expect(r.body.error.details.missing).toEqual(['privacy']);
  });

  it('revoking data sharing withdraws open requests but keeps journeys with a chosen provider', async () => {
    const { patient, requestId: assigned } = await acceptedRequest();
    const open = await makeRequest(patient);
    const staff = await makeStaff(await makeProvider());
    const before = await api.get('/api/v1/requests/queue').set(staff.auth);
    expect(before.body.data.map((x: { id: number }) => x.id)).toContain(open);

    const r = await api
      .post('/api/v1/consents')
      .set(patient.auth)
      .send({ consent_type: 'data_sharing', granted: false });
    expect(r.status).toBe(200);
    expect(r.body.data.withdrawn_requests).toEqual([open]);

    const [rows] = await pool.query<Row[]>('SELECT id, status FROM care_requests ORDER BY id');
    expect(rows).toEqual([
      { id: assigned, status: 'provider_accepted' },
      { id: open, status: 'cancelled' },
    ]);
    expect((await api.get('/api/v1/requests/queue').set(staff.auth)).body.data).toEqual([]);
    const history = await consentRows(patient.id);
    expect(
      history
        .filter((h) => h.consent_type === 'data_sharing')
        .map((h) => [h.granted, !!h.revoked_at]),
    ).toEqual([
      [true, true],
      [false, false],
    ]);
  });
});
