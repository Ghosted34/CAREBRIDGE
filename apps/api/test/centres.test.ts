import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool, type Row } from '../src/db/pool.js';
import { api, book, inHours, makeClinic, makeStaff, makeUser, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

const edit = (auth: Record<string, string>, providerId: number, centreId: number, body: object) =>
  api.put(`/api/v1/providers/${providerId}/centres/${centreId}`).set(auth).send(body);
const searchAsIkejaPatient = async () => {
  const patient = await makeUser('patient');
  await pool.execute(
    "UPDATE users SET address_city = 'Ikeja', address_state = 'Lagos' WHERE id = ?",
    [patient.id],
  );
  const day = inHours(48).slice(0, 10);
  const r = await api
    .post('/api/v1/search')
    .set(patient.auth)
    .send({ problem: 'toothache', periods: [{ from_date: day, to_date: day }] });
  return r.body.data.results as { centre_id: number; match: string }[];
};

describe('editing a centre', () => {
  it('the owner corrects the area, and search ranks the centre by it', async () => {
    const { providerId, centreId, owner } = await makeClinic({ city: 'Lagos', state: 'Lagos' });
    expect((await searchAsIkejaPatient())[0]).toMatchObject({
      centre_id: centreId,
      match: 'same_state',
    });

    const r = await edit(owner.auth, providerId, centreId, {
      name: 'Allen Avenue',
      address_line: '24 Allen Avenue',
      city: 'Ikeja',
      state: 'Lagos',
      postal_code: '100212',
      phone: null,
    });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ name: 'Allen Avenue', city: 'Ikeja', phone: null });
    expect((await searchAsIkejaPatient())[0]).toMatchObject({
      centre_id: centreId,
      match: 'same_area',
    });

    const [a] = await pool.query<Row[]>(
      "SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'PROVIDER_CENTRE_UPDATED' AND entity_id = ?",
      [centreId],
    );
    expect(Number(a[0]!.c)).toBe(1);
  });

  it('a centre taken off bookings disappears from search and cannot be booked; existing bookings stay', async () => {
    const { providerId, centreId, owner } = await makeClinic();
    const patient = await makeUser('patient');
    const { apptId } = await book(patient, centreId, inHours(26));

    expect((await edit(owner.auth, providerId, centreId, { is_active: false })).status).toBe(200);
    expect(await searchAsIkejaPatient()).toEqual([]);
    const late = await api
      .post('/api/v1/appointments')
      .set(patient.auth)
      .send({
        centre_id: centreId,
        starts_at: inHours(28),
        problem: 'toothache',
        has_emergency_symptoms: false,
      });
    expect(late.status).toBe(404);
    const [[appt]] = await pool.query<Row[]>('SELECT status FROM appointments WHERE id = ?', [
      apptId,
    ]);
    expect(appt!.status).toBe('requested');
  });

  it('only the owner of that clinic: not other staff, not another clinic, not patients', async () => {
    const { providerId, centreId } = await makeClinic();
    const clinician = await makeStaff(providerId, 'clinician');
    const scheduler = await makeStaff(providerId, 'scheduler');
    const other = await makeClinic();
    const patient = await makeUser('patient');
    for (const who of [clinician, scheduler, other.owner, patient]) {
      expect((await edit(who.auth, providerId, centreId, { city: 'Yaba' })).status).toBe(403);
    }
    // a centre that belongs to another clinic, addressed through your own clinic
    const own = await makeClinic();
    expect((await edit(own.owner.auth, own.providerId, centreId, { city: 'Yaba' })).status).toBe(
      404,
    );
    const [[c]] = await pool.query<Row[]>('SELECT city FROM provider_centres WHERE id = ?', [
      centreId,
    ]);
    expect(c!.city).toBe('Lekki');
  });

  it('validates the fields', async () => {
    const { providerId, centreId, owner } = await makeClinic();
    expect((await edit(owner.auth, providerId, centreId, { city: '' })).status).toBe(400);
    expect((await edit(owner.auth, providerId, centreId, { name: 'x'.repeat(191) })).status).toBe(
      400,
    );
  });
});
