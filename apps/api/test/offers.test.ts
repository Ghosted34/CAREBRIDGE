import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool, type Row } from '../src/db/pool.js';
import {
  api,
  auditActions,
  makeProvider,
  makeRequest,
  makeStaff,
  makeUser,
  resetDb,
} from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

const offer = (requestId: number, auth: Record<string, string>, providerId: number) =>
  api
    .post(`/api/v1/requests/${requestId}/offers`)
    .set(auth)
    .send({ provider_id: providerId, message: 'We can see you Thursday' });

async function requestRow(id: number) {
  const [rows] = await pool.query<Row[]>(
    'SELECT status, assigned_provider_id FROM care_requests WHERE id = ?',
    [id],
  );
  return rows[0]!;
}

describe('offers', () => {
  it('staff cannot offer on behalf of a provider they do not belong to (was a hole)', async () => {
    const patient = await makeUser('patient');
    const requestId = await makeRequest(patient);
    const theirs = await makeProvider();
    const staff = await makeStaff(await makeProvider());
    const r = await offer(requestId, staff.auth, theirs);
    expect(r.status).toBe(403);
  });

  it('receptionists cannot commit their provider to a patient', async () => {
    const patient = await makeUser('patient');
    const requestId = await makeRequest(patient);
    const providerId = await makeProvider();
    const receptionist = await makeStaff(providerId, 'receptionist');
    expect((await offer(requestId, receptionist.auth, providerId)).status).toBe(403);
  });

  it('a member offers → request moves to matching; duplicates are 409', async () => {
    const patient = await makeUser('patient');
    const requestId = await makeRequest(patient);
    const providerId = await makeProvider();
    const staff = await makeStaff(providerId, 'clinician');
    const r = await offer(requestId, staff.auth, providerId);
    expect(r.status).toBe(201);
    expect((await requestRow(requestId)).status).toBe('matching');
    expect(await auditActions('provider_offer', r.body.data.id)).toEqual(['OFFER_CREATED']);
    const dup = await offer(requestId, staff.auth, providerId);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_OFFER');
  });

  it('operators can offer on behalf of any verified provider (manual matching)', async () => {
    const patient = await makeUser('patient');
    const requestId = await makeRequest(patient);
    const operator = await makeUser('operator');
    expect((await offer(requestId, operator.auth, await makeProvider())).status).toBe(201);
    expect(
      (await offer(requestId, operator.auth, await makeProvider({ verified: false }))).status,
    ).toBe(404);
  });

  it('patient accepts one offer: provider assigned, other offers expired, no appointment created', async () => {
    const patient = await makeUser('patient');
    const requestId = await makeRequest(patient);
    const pA = await makeProvider();
    const pB = await makeProvider();
    const a = await offer(requestId, (await makeStaff(pA)).auth, pA);
    const b = await offer(requestId, (await makeStaff(pB)).auth, pB);

    const list = await api.get(`/api/v1/requests/${requestId}/offers`).set(patient.auth);
    expect(list.body.data).toHaveLength(2);

    const accept = await api.post(`/api/v1/offers/${a.body.data.id}/accept`).set(patient.auth);
    expect(accept.status).toBe(200);
    expect(await requestRow(requestId)).toEqual({
      status: 'provider_accepted',
      assigned_provider_id: pA,
    });
    const [offers] = await pool.query<Row[]>('SELECT id, status FROM provider_offers ORDER BY id');
    expect(offers.map((o) => o.status)).toEqual(['accepted', 'expired']);
    const [appts] = await pool.query<Row[]>('SELECT COUNT(*) AS n FROM appointments');
    expect(appts[0]!.n).toBe(0);

    const late = await api.post(`/api/v1/offers/${b.body.data.id}/accept`).set(patient.auth);
    expect(late.status).toBe(409);
  });

  it('only the requesting patient can accept; provider staff cannot accept their own offer', async () => {
    const patient = await makeUser('patient');
    const requestId = await makeRequest(patient);
    const providerId = await makeProvider();
    const staff = await makeStaff(providerId);
    const o = await offer(requestId, staff.auth, providerId);
    const other = await makeUser('patient');
    expect((await api.post(`/api/v1/offers/${o.body.data.id}/accept`).set(other.auth)).status).toBe(
      404,
    );
    expect((await api.post(`/api/v1/offers/${o.body.data.id}/accept`).set(staff.auth)).status).toBe(
      403,
    );
  });

  it('declining leaves the request open; providers can withdraw open offers', async () => {
    const patient = await makeUser('patient');
    const requestId = await makeRequest(patient);
    const pA = await makeProvider();
    const pB = await makeProvider();
    const staffB = await makeStaff(pB);
    const a = await offer(requestId, (await makeStaff(pA)).auth, pA);
    const b = await offer(requestId, staffB.auth, pB);
    await api.post(`/api/v1/offers/${a.body.data.id}/decline`).set(patient.auth);
    expect((await requestRow(requestId)).status).toBe('matching');
    const w = await api.post(`/api/v1/offers/${b.body.data.id}/withdraw`).set(staffB.auth);
    expect(w.body.data.status).toBe('withdrawn');
    const again = await api.post(`/api/v1/offers/${b.body.data.id}/withdraw`).set(staffB.auth);
    expect(again.status).toBe(409);
  });
});
