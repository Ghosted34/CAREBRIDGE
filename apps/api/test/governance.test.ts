import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool, type Row } from '../src/db/pool.js';
import {
  acceptedRequest,
  api,
  auditActions,
  completeVisit,
  makeProvider,
  makeStaff,
  makeUser,
  resetDb,
} from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

const estimateBody = { amount: 45000, currency: 'NGN', inclusions: 'Consultation and X-rays' };
const referralBody = (receiving_provider_id: number) => ({
  receiving_provider_id,
  referred_specialty: 'endodontics',
  clinical_summary: 'Deep caries on the lower right molar, needs specialist review.',
});

/**
 * Clinical governance: cost estimates, specialist referrals and treatment planning are post-visit
 * actions. Before the patient has been seen (an appointment `checked_in` or `completed`) the API
 * refuses them with 409 VISIT_REQUIRED, whatever the caller's role.
 */
describe('post-visit governance', () => {
  it('refuses a cost estimate before the patient has been seen, and allows it after', async () => {
    const { patient, staff, requestId } = await acceptedRequest();
    await api.post(`/api/v1/requests/${requestId}/start-assessment`).set(staff.auth);

    const tooEarly = await api
      .post(`/api/v1/requests/${requestId}/estimates`)
      .set(staff.auth)
      .send(estimateBody);
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.error.code).toBe('VISIT_REQUIRED');
    const [rows] = await pool.query<Row[]>('SELECT COUNT(*) AS n FROM service_estimates');
    expect(rows[0]!.n).toBe(0);

    await completeVisit(patient, staff, requestId);
    const issued = await api
      .post(`/api/v1/requests/${requestId}/estimates`)
      .set(staff.auth)
      .send(estimateBody);
    expect(issued.status).toBe(201);
    expect(issued.body.data).toMatchObject({ care_request_id: requestId, status: 'issued' });
    // The amount is an id-and-numbers payload, never clinical text.
    expect(await auditActions('service_estimate', issued.body.data.id)).toEqual([
      'ESTIMATE_ISSUED',
    ]);
  });

  it('refuses a specialist referral before the patient has been seen, and allows it after', async () => {
    const { patient, staff, requestId } = await acceptedRequest();
    const specialistId = await makeProvider({ specialties: ['endodontics'] });
    await api.post(`/api/v1/requests/${requestId}/start-assessment`).set(staff.auth);

    const tooEarly = await api
      .post(`/api/v1/requests/${requestId}/referrals`)
      .set(staff.auth)
      .send(referralBody(specialistId));
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.error.code).toBe('VISIT_REQUIRED');
    const [rows] = await pool.query<Row[]>('SELECT COUNT(*) AS n FROM clinical_referrals');
    expect(rows[0]!.n).toBe(0);

    await completeVisit(patient, staff, requestId);
    const sent = await api
      .post(`/api/v1/requests/${requestId}/referrals`)
      .set(staff.auth)
      .send(referralBody(specialistId));
    expect(sent.status).toBe(201);
    expect(sent.body.data).toMatchObject({ status: 'sent', referred_specialty: 'endodontics' });
    // Clinical summaries stay out of the audit trail.
    expect(sent.body.data.clinical_summary).toBe(referralBody(specialistId).clinical_summary);
    const [audit] = await pool.query<Row[]>(
      'SELECT metadata FROM audit_logs WHERE entity_type = ? AND entity_id = ?',
      ['clinical_referral', sent.body.data.id],
    );
    expect(String(audit[0]!.metadata)).not.toMatch(/Deep caries/);
  });

  it('applies to operators and admins too — the rule is about the patient, not the role', async () => {
    const { requestId } = await acceptedRequest();
    const operator = await makeUser('operator');
    const r = await api
      .post(`/api/v1/requests/${requestId}/estimates`)
      .set(operator.auth)
      .send(estimateBody);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('VISIT_REQUIRED');
  });

  it('still refuses callers with no right to act for the clinic (permission wins)', async () => {
    const { patient, staff, requestId } = await acceptedRequest();
    await completeVisit(patient, staff, requestId);
    const outsider = await makeStaff(await makeProvider({ specialties: ['endodontics'] }), 'owner');
    const estimate = await api
      .post(`/api/v1/requests/${requestId}/estimates`)
      .set(outsider.auth)
      .send(estimateBody);
    expect(estimate.status).toBe(403);
    const referral = await api
      .post(`/api/v1/requests/${requestId}/referrals`)
      .set(outsider.auth)
      .send(referralBody(await makeProvider({ specialties: ['endodontics'] })));
    expect(referral.status).toBe(403);
  });
});
