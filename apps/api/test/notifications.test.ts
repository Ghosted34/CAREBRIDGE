import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool, type Row } from '../src/db/pool.js';
import { mask } from '../src/modules/notifications/providers/mask.js';
import {
  ProviderError,
  type Channel,
  type NotificationProvider,
} from '../src/modules/notifications/providers/types.js';
import { notify } from '../src/modules/notifications/notifications.service.js';
import { MAX_ATTEMPTS, processBatch } from '../src/modules/notifications/worker.js';
import {
  acceptedRequest,
  api,
  bookingBody,
  inHours,
  makeClinic,
  makeStaff,
  makeUser,
  resetDb,
} from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

async function rows(where = '1=1', params: unknown[] = []) {
  const [r] = await pool.query<Row[]>(
    `SELECT id, user_id, channel, template_key, status, attempts, last_error, next_attempt_at, payload
       FROM notifications WHERE ${where} ORDER BY id`,
    params,
  );
  return r;
}
const kinds = async (userId: number) =>
  (await rows('user_id = ?', [userId])).map((r) => `${r.template_key}:${r.channel}:${r.status}`);

function recordingProvider<C extends Channel>(
  channel: C,
  fail: false | 'retryable' | 'permanent' = false,
): NotificationProvider<C> & { sent: { to: string; text: string }[] } {
  const sent: { to: string; text: string }[] = [];
  return {
    name: 'test',
    channel,
    sent,
    async send(msg) {
      if (fail === 'retryable') throw new Error('provider unavailable');
      if (fail === 'permanent') throw new ProviderError('invalid number', false, 400);
      sent.push({ to: msg.to, text: msg.text });
      return { providerMessageId: `msg-${sent.length}` };
    },
  };
}

describe('events create notifications', () => {
  it('a booking request notifies every member of that clinic, and nobody else', async () => {
    const patient = await makeUser('patient');
    const { providerId, centreId, owner } = await makeClinic();
    const receptionist = await makeStaff(providerId, 'receptionist');
    const otherClinic = await makeClinic();
    await api
      .post('/api/v1/appointments')
      .set(patient.auth)
      .send(bookingBody(centreId, inHours(6)));
    for (const u of [owner, receptionist]) {
      expect(await kinds(u.id)).toEqual([
        'appointment_booked_provider:in_app:sent',
        'appointment_booked_provider:email:queued',
      ]);
    }
    expect(await kinds(otherClinic.owner.id)).toEqual([]);
  });

  it('booking, confirming and cancelling notify the other side', async () => {
    const { patient, staff, apptId } = await acceptedRequest();
    await api.post(`/api/v1/appointments/${apptId}/confirm`).set(staff.auth);
    await api.post(`/api/v1/appointments/${apptId}/cancel`).set(staff.auth);
    expect(await kinds(staff.id)).toContain('appointment_booked_provider:email:queued');
    const p = await kinds(patient.id);
    expect(p).toContain('appointment_confirmed:sms:queued');
    expect(p).toContain('appointment_cancelled_patient:sms:queued');
    expect(p).not.toContain('appointment_booked_patient:in_app:sent'); // patient booked it themselves
  });

  it('cancelling a request tells the assigned clinic', async () => {
    const { patient, staff, requestId } = await acceptedRequest();
    await api.post(`/api/v1/requests/${requestId}/cancel`).set(patient.auth);
    expect(await kinds(staff.id)).toContain('request_cancelled:in_app:sent');
  });

  it('approving a pending staff account sends account_approved', async () => {
    const admin = await makeUser('admin');
    const pending = await makeUser('provider_staff', 'pending');
    await api
      .post(`/api/v1/admin/users/${pending.id}/status`)
      .set(admin.auth)
      .send({ status: 'active' });
    expect(await kinds(pending.id)).toEqual([
      'account_approved:in_app:sent',
      'account_approved:email:queued',
    ]);
  });

  it('never stores or renders clinical text', async () => {
    const secret = 'Severe pain lower left molar, possible abscess';
    const patient = await makeUser('patient');
    const { centreId, owner } = await makeClinic({ specialties: ['endodontics'] });
    const r = await api
      .post('/api/v1/appointments')
      .set(patient.auth)
      .send(bookingBody(centreId, inHours(6), { problem: 'root_canal', details: secret }));
    expect(r.status).toBe(201);
    await api.post(`/api/v1/appointments/${r.body.data.id}/confirm`).set(owner.auth);
    const stored = JSON.stringify(await rows());
    expect(stored).not.toContain('molar');
    expect(stored).not.toContain('Root canal');
    for (const who of [patient, owner]) {
      const inbox = await api.get('/api/v1/notifications').set(who.auth);
      expect(JSON.stringify(inbox.body)).not.toContain('molar');
    }
    await expect(
      notify(pool, [patient.id], 'appointment_confirmed', { description: 'x' }),
    ).rejects.toThrow(/must not contain/);
  });
});

describe('inbox endpoints', () => {
  it('lists rendered in-app notifications, counts unread, marks read', async () => {
    const { patient, staff, apptId } = await acceptedRequest();
    await api.post(`/api/v1/appointments/${apptId}/confirm`).set(staff.auth);
    const inbox = await api.get('/api/v1/notifications').set(patient.auth);
    expect(inbox.status).toBe(200);
    expect(inbox.body.data).toHaveLength(1); // SMS rows are not part of the inbox
    expect(inbox.body.data[0]).toMatchObject({
      type: 'appointment_confirmed',
      read_at: null,
    });
    expect(
      (await api.get('/api/v1/notifications/unread-count').set(patient.auth)).body.data.count,
    ).toBe(1);

    const id = inbox.body.data[0].id;
    const other = await makeUser('patient');
    expect((await api.post(`/api/v1/notifications/${id}/read`).set(other.auth)).status).toBe(404);
    expect((await api.post(`/api/v1/notifications/${id}/read`).set(patient.auth)).status).toBe(200);
    expect(
      (await api.get('/api/v1/notifications?unread=true').set(patient.auth)).body.data,
    ).toEqual([]);
  });

  it('read-all clears the count', async () => {
    const { staff, apptId, patient } = await acceptedRequest();
    await api.post(`/api/v1/appointments/${apptId}/cancel`).set(patient.auth);
    expect(
      (await api.get('/api/v1/notifications/unread-count').set(staff.auth)).body.data.count,
    ).toBe(2);
    const r = await api.post('/api/v1/notifications/read-all').set(staff.auth);
    expect(r.body.data.updated).toBe(2);
    expect(
      (await api.get('/api/v1/notifications/unread-count').set(staff.auth)).body.data.count,
    ).toBe(0);
  });

  it('requires sign-in', async () => {
    expect((await api.get('/api/v1/notifications')).status).toBe(401);
  });
});

describe('worker', () => {
  it('sends queued SMS and email with generic text and marks them sent', async () => {
    await acceptedRequest();
    const sms = recordingProvider('sms');
    const email = recordingProvider('email');
    const r = await processBatch({ sms, email });
    expect(r).toEqual({ sent: 1, retrying: 0, failed: 0, skipped: 0 });
    expect(sms.sent).toEqual([]);
    expect(email.sent[0]!.text).toMatch(/A patient booked/);
    expect((await rows("channel <> 'in_app'")).map((x) => x.status)).toEqual(['sent']);
    expect(await processBatch({ sms, email })).toEqual({
      sent: 0,
      retrying: 0,
      failed: 0,
      skipped: 0,
    });
  });

  it('retries failures with backoff, then gives up after MAX_ATTEMPTS', async () => {
    await acceptedRequest();
    const broken = {
      sms: recordingProvider('sms', 'retryable'),
      email: recordingProvider('email', 'retryable'),
    };
    const r = await processBatch(broken);
    expect(r.retrying).toBe(1); // only 1 email notification queued
    const [email] = await rows("channel = 'email'");
    expect(email).toMatchObject({
      status: 'queued',
      attempts: 1,
      last_error: 'provider unavailable',
    });
    expect(email!.next_attempt_at).not.toBeNull();
    // Not picked up again before its retry time
    expect((await processBatch(broken)).retrying).toBe(0);
    // Last allowed attempt fails → failed
    await pool.execute(
      'UPDATE notifications SET attempts = ?, next_attempt_at = NULL WHERE id = ?',
      [MAX_ATTEMPTS - 1, email!.id],
    );
    await processBatch({ sms: null, email: broken.email });
    const [after] = await rows('id = ?', [email!.id]);
    expect(after).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });
  });

  it('a permanent provider error fails at once without retrying', async () => {
    await acceptedRequest();
    const r = await processBatch({
      sms: recordingProvider('sms', 'permanent'),
      email: recordingProvider('email', 'permanent'),
    });
    expect(r).toMatchObject({ failed: 1, retrying: 0 });
    const [failed] = await rows("status = 'failed'");
    expect(failed).toMatchObject({ attempts: 1, last_error: 'invalid number' });
  });

  it('skips switched-off channels and suspended users', async () => {
    const { staff } = await acceptedRequest();
    await pool.execute(`UPDATE users SET status = 'suspended' WHERE id = ?`, [staff.id]);
    const r = await processBatch({
      sms: recordingProvider('sms'),
      email: recordingProvider('email'),
    });
    expect(r).toEqual({ sent: 0, retrying: 0, failed: 0, skipped: 1 });
    expect((await rows("channel <> 'in_app'")).map((x) => x.last_error)).toEqual(
      expect.arrayContaining(['user suspended']),
    );
  });

  it('masks addresses in logs', () => {
    expect(mask('+2348012345678')).toBe('+234***678');
    expect(mask('ada@example.com')).toBe('ad***@example.com');
  });
});
