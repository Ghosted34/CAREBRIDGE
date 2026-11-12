import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool, type Row } from '../src/db/pool.js';
import { acceptedRequest, api, makeClinic, makeStaff, makeUser, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

const note = (type: string, summary = 'Take paracetamol 500mg as needed') => ({
  note_type: type,
  summary,
});

/** A booking that the clinic confirmed and checked in — the point notes become possible. */
async function checkedIn() {
  const ctx = await acceptedRequest();
  await api.post(`/api/v1/appointments/${ctx.apptId}/confirm`).set(ctx.staff.auth);
  await api.post(`/api/v1/appointments/${ctx.apptId}/check-in`).set(ctx.staff.auth);
  return ctx;
}

describe('post-visit notes', () => {
  it('cannot be added before check-in (regression: the rule used to be inverted)', async () => {
    const { staff, apptId } = await acceptedRequest();
    await api.post(`/api/v1/appointments/${apptId}/confirm`).set(staff.auth);
    const r = await api
      .post(`/api/v1/appointments/${apptId}/notes`)
      .set(staff.auth)
      .send(note('prescription'));
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('VISIT_NOT_STARTED');
  });

  it('can be added after check-in, of every type, and the patient is notified without clinical text', async () => {
    const { patient, staff, apptId } = await checkedIn();
    for (const t of ['prescription', 'referral', 'follow_up']) {
      const r = await api
        .post(`/api/v1/appointments/${apptId}/notes`)
        .set(staff.auth)
        .send(note(t));
      expect(r.status, t).toBe(200);
    }
    const [n] = await pool.query<Row[]>(
      "SELECT payload FROM notifications WHERE user_id = ? AND template_key = 'appointment_note_added'",
      [patient.id],
    );
    expect(JSON.stringify(n)).not.toContain('paracetamol');
  });

  it('prescriptions and referrals: dentists and owners only — not schedulers or receptionists', async () => {
    const { providerId, apptId } = await checkedIn();
    const clinician = await makeStaff(providerId, 'clinician');
    const scheduler = await makeStaff(providerId, 'scheduler');
    const receptionist = await makeStaff(providerId, 'receptionist');
    const send = (auth: Record<string, string>, t: string) =>
      api.post(`/api/v1/appointments/${apptId}/notes`).set(auth).send(note(t));
    expect((await send(clinician.auth, 'prescription')).status).toBe(200);
    expect((await send(scheduler.auth, 'prescription')).status).toBe(403);
    expect((await send(scheduler.auth, 'referral')).status).toBe(403);
    expect((await send(scheduler.auth, 'follow_up')).status).toBe(200);
    expect((await send(receptionist.auth, 'follow_up')).status).toBe(403);
  });

  it('CareBridge operators/admins and other clinics cannot write notes', async () => {
    const { apptId } = await checkedIn();
    const operator = await makeUser('operator');
    const outsider = await makeStaff((await makeClinic()).providerId, 'owner');
    expect(
      (
        await api
          .post(`/api/v1/appointments/${apptId}/notes`)
          .set(operator.auth)
          .send(note('follow_up'))
      ).status,
    ).toBe(403);
    expect(
      (
        await api
          .post(`/api/v1/appointments/${apptId}/notes`)
          .set(outsider.auth)
          .send(note('follow_up'))
      ).status,
    ).toBe(403);
  });

  it('only the patient and the clinic can read notes (regression: anyone signed in could)', async () => {
    const { patient, staff, apptId } = await checkedIn();
    await api
      .post(`/api/v1/appointments/${apptId}/notes`)
      .set(staff.auth)
      .send(note('prescription', 'Amoxicillin 500mg'));
    const own = await api.get(`/api/v1/appointments/${apptId}/notes`).set(patient.auth);
    expect(own.status).toBe(200);
    expect(own.body.data[0].summary).toBe('Amoxicillin 500mg');
    expect((await api.get(`/api/v1/appointments/${apptId}/notes`).set(staff.auth)).status).toBe(
      200,
    );

    const stranger = await makeUser('patient');
    const otherClinic = await makeStaff((await makeClinic()).providerId);
    const operator = await makeUser('operator');
    for (const who of [stranger, otherClinic, operator]) {
      const r = await api.get(`/api/v1/appointments/${apptId}/notes`).set(who.auth);
      expect(r.status, who.role).toBe(404);
      expect(JSON.stringify(r.body)).not.toContain('Amoxicillin');
    }
  });

  it('a closing note completes the visit and closes it', async () => {
    const { staff, apptId, requestId } = await checkedIn();
    const r = await api
      .post(`/api/v1/appointments/${apptId}/notes`)
      .set(staff.auth)
      .send(note('closing_consultancy', 'All done'));
    expect(r.status).toBe(200);
    const [[a], [v]] = await Promise.all([
      pool.query<Row[]>('SELECT status FROM appointments WHERE id = ?', [apptId]).then((x) => x[0]),
      pool
        .query<Row[]>('SELECT status FROM care_requests WHERE id = ?', [requestId])
        .then((x) => x[0]),
    ]);
    expect(a!.status).toBe('completed');
    expect(v!.status).toBe('completed');
  });

  it('a closing note leaves the visit open while a follow-up booking is still pending', async () => {
    const { staff, centreId, apptId, requestId } = await checkedIn();
    const f = await api
      .post('/api/v1/appointments')
      .set(staff.auth)
      .send({
        centre_id: centreId,
        starts_at:
          new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 11) + '09:00:00+01:00',
        care_request_id: requestId,
      });
    expect(f.status).toBe(201);
    await api
      .post(`/api/v1/appointments/${apptId}/notes`)
      .set(staff.auth)
      .send(note('closing_consultancy'));
    const [v] = await pool.query<Row[]>('SELECT status FROM care_requests WHERE id = ?', [
      requestId,
    ]);
    expect(v[0]!.status).toBe('provider_accepted');
  });
});
