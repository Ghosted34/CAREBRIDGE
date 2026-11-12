import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool, type Row } from '../src/db/pool.js';
import {
  api,
  auditActions,
  makeProvider,
  makeStaff,
  makeUser,
  PASSWORD,
  resetDb,
} from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

let seq = 0;
/** A clinic registering itself: pending user + pending facility, with the signer as its owner. */
const clinicRegistration = () => {
  seq += 1;
  return {
    full_name: 'Ngozi Owner',
    email: `owner${seq}@clinic.test`,
    phone: `+234802${String(seq).padStart(7, '0')}`,
    password: PASSWORD,
    role: 'provider_staff',
    accept_terms: true,
    accept_privacy: true,
    clinic: {
      legal_name: `Ikeja Dental ${seq} Ltd`,
      display_name: `Ikeja Dental ${seq}`,
      provider_type: 'clinic',
      registration_number: `MDCN-${seq}`,
      cac_number: `RC-${String(seq).padStart(6, '0')}`,
      tax_id: `TIN-${String(seq).padStart(8, '0')}-001`,
      city: 'Lagos',
      address: '12 Awolowo Road, Ikeja, Lagos',
      specialties: ['dentistry'],
    },
  };
};

const rows = async (sql: string, params: unknown[] = []) =>
  (await pool.query<Row[]>(sql, params))[0];

describe('clinic self-onboarding', () => {
  it('creates a pending facility owned by the person registering, hidden from the directory', async () => {
    const r = await api.post('/api/v1/auth/register').send(clinicRegistration());
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ role: 'provider_staff', status: 'pending' });
    const providerId = r.body.data.provider_id as number;
    expect(providerId).toBeTypeOf('number');

    const [provider] = await rows('SELECT * FROM providers WHERE id = ?', [providerId]);
    expect(provider).toMatchObject({
      verification_status: 'pending',
      status: 'active',
      city: 'Lagos',
    });
    expect(provider!.display_name).toMatch(/^Ikeja Dental \d+$/);
    const [member] = await rows(
      'SELECT provider_role FROM provider_users WHERE provider_id = ? AND user_id = ?',
      [providerId, r.body.data.id],
    );
    expect(member!.provider_role).toBe('owner');
    expect(await auditActions('provider', providerId)).toEqual(['PROVIDER_SELF_REGISTERED']);
    // Nothing pending review is public or bookable.
    expect((await api.get('/api/v1/providers?specialty=dentistry&city=Lagos')).body.data).toEqual(
      [],
    );
    expect((await api.get(`/api/v1/providers/${providerId}`)).status).toBe(404);
  });

  it('verifying the facility also activates its pending owner, who can then sign in (regression)', async () => {
    const reg = clinicRegistration();
    const providerId = (await api.post('/api/v1/auth/register').send(reg)).body.data
      .provider_id as number;
    // A pending account cannot sign in.
    const early = await api
      .post('/api/v1/auth/login')
      .send({ email: reg.email, password: PASSWORD });
    expect(early.status).toBe(403);

    const admin = await makeUser('admin');
    const v = await api
      .post(`/api/v1/admin/providers/${providerId}/verification`)
      .set(admin.auth)
      .send({ verification_status: 'verified' });
    expect(v.status).toBe(200);
    const [owner] = await rows('SELECT id, status FROM users WHERE email = ?', [reg.email]);
    expect(owner!.status).toBe('active');
    expect(v.body.data.activated_owners).toEqual([owner!.id]);
    expect(await auditActions('user', owner!.id as number)).toContain('USER_ACTIVATED');
    const [n] = await rows(
      "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND template_key = 'account_approved'",
      [owner!.id],
    );
    expect(Number(n!.c)).toBeGreaterThan(0);

    const login = await api
      .post('/api/v1/auth/login')
      .send({ email: reg.email, password: PASSWORD });
    expect(login.status).toBe(200);
    const me = await api
      .get('/api/v1/me')
      .set({ Authorization: `Bearer ${login.body.data.token as string}` });
    expect(me.body.data.memberships).toEqual([
      expect.objectContaining({ provider_id: providerId, provider_role: 'owner' }),
    ]);
  });

  it('rejecting a facility leaves the owner pending; verifying never re-activates a suspended owner', async () => {
    const admin = await makeUser('admin');
    const a = clinicRegistration();
    const pa = (await api.post('/api/v1/auth/register').send(a)).body.data.provider_id as number;
    await api
      .post(`/api/v1/admin/providers/${pa}/verification`)
      .set(admin.auth)
      .send({ verification_status: 'rejected' });
    expect((await rows('SELECT status FROM users WHERE email = ?', [a.email]))[0]!.status).toBe(
      'pending',
    );

    const b = clinicRegistration();
    const pb = (await api.post('/api/v1/auth/register').send(b)).body.data.provider_id as number;
    await pool.execute("UPDATE users SET status = 'suspended' WHERE email = ?", [b.email]);
    await api
      .post(`/api/v1/admin/providers/${pb}/verification`)
      .set(admin.auth)
      .send({ verification_status: 'verified' });
    expect((await rows('SELECT status FROM users WHERE email = ?', [b.email]))[0]!.status).toBe(
      'suspended',
    );
  });

  it('refuses facility details from a patient account and duplicate registration numbers', async () => {
    const patient = clinicRegistration();
    const bad = await api
      .post('/api/v1/auth/register')
      .send({ ...patient, role: 'patient', email: 'patient@clinic.test' });
    expect(bad.status).toBe(400);

    const first = clinicRegistration();
    expect((await api.post('/api/v1/auth/register').send(first)).status).toBe(201);
    const second = clinicRegistration();
    const dup = await api.post('/api/v1/auth/register').send({
      ...second,
      clinic: { ...second.clinic, registration_number: first.clinic.registration_number },
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ALREADY_REGISTERED');
  });
});

/** Register → admin verifies → admin activates → sign in as the clinic owner. */
async function verifiedOwner() {
  const reg = clinicRegistration();
  const created = await api.post('/api/v1/auth/register').send(reg);
  const providerId = created.body.data.provider_id as number;
  const admin = await makeUser('admin');
  await api
    .post(`/api/v1/admin/providers/${providerId}/verification`)
    .set(admin.auth)
    .send({ verification_status: 'verified' });
  await api
    .post(`/api/v1/admin/users/${created.body.data.id}/status`)
    .set(admin.auth)
    .send({ status: 'active' });
  const login = await api.post('/api/v1/auth/login').send({ email: reg.email, password: PASSWORD });
  return {
    providerId,
    ownerId: created.body.data.id as number,
    auth: { Authorization: `Bearer ${login.body.data.token as string}` },
  };
}

describe('clinic team management (owner self-service)', () => {
  it('is locked while the facility is unverified', async () => {
    const providerId = await makeProvider({ verified: false });
    const owner = await makeStaff(providerId, 'owner');
    const invite = await makeUser('provider_staff');
    // The roster is readable while pending; changing it is not.
    expect((await api.get(`/api/v1/providers/${providerId}/team`).set(owner.auth)).status).toBe(
      200,
    );
    const add = await api
      .post(`/api/v1/providers/${providerId}/team`)
      .set(owner.auth)
      .send({ user_id: invite.id, provider_role: 'clinician' });
    expect(add.status).toBe(409);
    expect(add.body.error.code).toBe('PROVIDER_NOT_VERIFIED');
  });

  it('owner adds a team member, activating a pending account and notifying them', async () => {
    const { providerId, ownerId, auth } = await verifiedOwner();
    const invite = await makeUser('provider_staff', 'pending'); // activated by the invite
    const r = await api
      .post(`/api/v1/providers/${providerId}/team`)
      .set(auth)
      .send({ user_id: invite.id, provider_role: 'clinician' });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      provider_id: providerId,
      user_id: invite.id,
      provider_role: 'clinician',
      activated: true,
    });
    const [user] = await rows('SELECT status FROM users WHERE id = ?', [invite.id]);
    expect(user!.status).toBe('active');
    expect(await auditActions('provider', providerId)).toContain('PROVIDER_MEMBER_SET');
    expect(await auditActions('user', invite.id)).toContain('USER_ACTIVATED');
    const [invited] = await rows('SELECT email FROM users WHERE id = ?', [invite.id]);
    const inviteLogin = await api
      .post('/api/v1/auth/login')
      .send({ email: invited!.email, password: PASSWORD });
    const inbox = await api.get('/api/v1/notifications').set({
      Authorization: `Bearer ${inviteLogin.body.data.token as string}`,
    });
    expect(inbox.body.data.map((n: { type: string }) => n.type)).toContain('team_invite');

    const team = await api.get(`/api/v1/providers/${providerId}/team`).set(auth);
    expect(team.body.data).toEqual([
      expect.objectContaining({ user_id: ownerId, provider_role: 'owner' }),
      expect.objectContaining({ user_id: invite.id, provider_role: 'clinician' }),
    ]);
  });

  it('refuses non-owners, patients, other clinics and suspended accounts', async () => {
    const { providerId, auth } = await verifiedOwner();
    const clinician = await makeStaff(providerId, 'clinician');
    const invite = await makeUser('provider_staff');
    const body = { user_id: invite.id, provider_role: 'scheduler' };

    // A clinician works at the clinic but does not manage its roster.
    expect(
      (await api.post(`/api/v1/providers/${providerId}/team`).set(clinician.auth).send(body))
        .status,
    ).toBe(403);
    // Another clinic's owner cannot add themselves to this one.
    const outsider = await makeStaff(await makeProvider(), 'owner');
    expect(
      (await api.post(`/api/v1/providers/${providerId}/team`).set(outsider.auth).send(body)).status,
    ).toBe(403);
    // Patients and suspended accounts cannot be linked at all.
    const patient = await makeUser('patient');
    const asPatient = await api
      .post(`/api/v1/providers/${providerId}/team`)
      .set(auth)
      .send({ user_id: patient.id, provider_role: 'receptionist' });
    expect(asPatient.status).toBe(409);
    expect(asPatient.body.error.code).toBe('NOT_PROVIDER_STAFF');
    await pool.execute(`UPDATE users SET status = 'suspended' WHERE id = ?`, [invite.id]);
    const suspended = await api.post(`/api/v1/providers/${providerId}/team`).set(auth).send(body);
    expect(suspended.status).toBe(409);
    expect(suspended.body.error.code).toBe('ACCOUNT_SUSPENDED');
    // Owners are appointed by CareBridge, never through this endpoint.
    expect(
      (
        await api
          .post(`/api/v1/providers/${providerId}/team`)
          .set(auth)
          .send({ ...body, provider_role: 'owner' })
      ).status,
    ).toBe(400);
  });

  it('owner removes a team member, but never an owner or themselves', async () => {
    const { providerId, ownerId, auth } = await verifiedOwner();
    const member = await makeStaff(providerId, 'receptionist');
    expect(
      (await api.delete(`/api/v1/providers/${providerId}/team/${member.id}`).set(auth)).status,
    ).toBe(200);
    const [left] = await rows('SELECT * FROM provider_users WHERE user_id = ?', [member.id]);
    expect(left).toBeUndefined();
    expect(await auditActions('provider', providerId)).toContain('PROVIDER_MEMBER_REMOVED');

    const secondOwner = await makeStaff(providerId, 'owner');
    const ownerRemoval = await api
      .delete(`/api/v1/providers/${providerId}/team/${secondOwner.id}`)
      .set(auth);
    expect(ownerRemoval.status).toBe(409);
    expect(ownerRemoval.body.error.code).toBe('OWNER_CHANGE_FORBIDDEN');

    const self = await api.delete(`/api/v1/providers/${providerId}/team/${ownerId}`).set(auth);
    expect(self.status).toBe(409);
    expect(self.body.error.code).toBe('SELF_CHANGE');

    const stranger = await api
      .delete(`/api/v1/providers/${providerId}/team/${(await makeUser('provider_staff')).id}`)
      .set(auth);
    expect(stranger.status).toBe(404);
  });

  it('staff lookup is for verified clinic owners only, and returns contact details only', async () => {
    const { auth } = await verifiedOwner();
    const target = await makeUser('provider_staff', 'pending');
    const [email] = await rows('SELECT email FROM users WHERE id = ?', [target.id]);
    const byEmail = await api.get(`/api/v1/staff-accounts?q=${email!.email}`).set(auth);
    expect(byEmail.status).toBe(200);
    expect(byEmail.body.data).toEqual([
      expect.objectContaining({ id: target.id, status: 'pending' }),
    ]);
    expect(byEmail.body.data[0]).not.toHaveProperty('password_hash');
    expect(byEmail.body.data[0]).not.toHaveProperty('phone');

    const patient = await makeUser('patient');
    expect((await api.get('/api/v1/staff-accounts?q=user').set(patient.auth)).status).toBe(403);
    // A clinician may not enumerate accounts either — only owners invite.
    const clinicianAuth = (await makeStaff(await makeProvider(), 'clinician')).auth;
    expect((await api.get('/api/v1/staff-accounts?q=user').set(clinicianAuth)).status).toBe(403);
    expect((await api.get('/api/v1/staff-accounts')).status).toBe(401);
  });
});
