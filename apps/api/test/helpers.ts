import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { pool, type Result, type Row } from '../src/db/pool.js';
import { POLICIES } from '../src/modules/consents/policies.js';
import type { ProviderRole, Role } from '../src/types.js';

export const api = supertest(createApp());

// Every table tests can write to (keep in step with migrations — a missing one leaks between tests).
const TABLES = [
  'audit_logs',
  'notifications',
  'user_consents',
  'payments',
  'service_estimates',
  'clinical_referrals',
  'clinical_documents',
  'appointment_notes',
  'appointments',
  'care_requests',
  'provider_slots',
  'provider_schedules',
  'provider_caregivers',
  'provider_fees',
  'provider_centres',
  'provider_users',
  'providers',
  'users',
];

export async function resetDb() {
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of TABLES) await pool.query(`TRUNCATE TABLE ${t}`);
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
}

let seq = 0;
export const PASSWORD = 'correct-horse-battery';
const HASH = bcrypt.hashSync(PASSWORD, 4);

export interface TestUser {
  id: number;
  role: Role;
  token: string;
  auth: { Authorization: string };
}

export async function makeUser(
  role: Role = 'patient',
  status = 'active',
  opts: { consents?: boolean } = {},
): Promise<TestUser> {
  seq += 1;
  const [r] = await pool.execute<Result>(
    `INSERT INTO users(full_name, email, phone, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      `Test ${role} ${seq}`,
      `user${seq}@test.local`,
      `+23480${String(seq).padStart(8, '0')}`,
      HASH,
      role,
      status,
    ],
  );
  // By default users have accepted everything a normal sign-up (and, for patients, a first request) would.
  if (opts.consents !== false) {
    const types =
      role === 'patient'
        ? (['terms', 'privacy', 'data_sharing'] as const)
        : (['terms', 'privacy'] as const);
    for (const t of types) {
      await pool.execute(
        `INSERT INTO user_consents(user_id, consent_type, version, granted, source) VALUES (?, ?, ?, TRUE, 'registration')`,
        [r.insertId, t, POLICIES[t].version],
      );
    }
  }
  const token = jwt.sign({ role }, env.JWT_SECRET, {
    subject: String(r.insertId),
    expiresIn: '1h',
  });
  return { id: r.insertId, role, token, auth: { Authorization: `Bearer ${token}` } };
}

export async function makeProvider(
  o: { verified?: boolean; specialties?: string[]; city?: string } = {},
) {
  seq += 1;
  const [r] = await pool.execute<Result>(
    `INSERT INTO providers(legal_name, display_name, provider_type, registration_number,
       verification_status, status, city, address, specialties)
     VALUES (?, ?, 'clinic', ?, ?, 'active', ?, 'Test address, Lagos', ?)`,
    [
      `Clinic ${seq} Ltd`,
      `Clinic ${seq}`,
      `REG-${seq}`,
      o.verified === false ? 'pending' : 'verified',
      o.city ?? 'Lagos',
      JSON.stringify(o.specialties ?? ['dentistry']),
    ],
  );
  return r.insertId;
}

export async function makeStaff(providerId: number, providerRole: ProviderRole = 'owner') {
  const user = await makeUser('provider_staff');
  await pool.execute(
    'INSERT INTO provider_users(provider_id, user_id, provider_role) VALUES (?, ?, ?)',
    [providerId, user.id, providerRole],
  );
  return user;
}

/**
 * An operating centre with opening hours. Default: open every day 00:00–23:30 Lagos time in 30-minute
 * slots, so any whole or half hour from inHours() is bookable unless a test says otherwise.
 */
export async function makeCentre(
  providerId: number,
  o: {
    name?: string;
    city?: string;
    state?: string;
    hours?: { day_of_week: number; open: string; close: string; slot?: number }[];
  } = {},
) {
  seq += 1;
  const [r] = await pool.execute<Result>(
    `INSERT INTO provider_centres(provider_id, name, address_line, city, state, postal_code)
     VALUES (?, ?, ?, ?, ?, '100001')`,
    [
      providerId,
      o.name ?? `Centre ${seq}`,
      `${seq} Test Street`,
      o.city ?? 'Lekki',
      o.state ?? 'Lagos',
    ],
  );
  const hours: { day_of_week: number; open: string; close: string; slot?: number }[] =
    o.hours ??
    [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day_of_week: d, open: '00:00', close: '23:30' }));
  for (const h of hours) {
    await pool.execute(
      `INSERT INTO provider_schedules(provider_id, centre_id, day_of_week, open_time, close_time, slot_duration_minutes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [providerId, r.insertId, h.day_of_week, h.open, h.close, h.slot ?? 30],
    );
  }
  return r.insertId;
}

/** A verified clinic with one centre and an owner. */
export async function makeClinic(
  o: { specialties?: string[]; city?: string; state?: string; verified?: boolean } = {},
) {
  const providerId = await makeProvider(o);
  const centreId = await makeCentre(providerId, { city: o.city, state: o.state });
  const owner = await makeStaff(providerId, 'owner');
  return { providerId, centreId, owner };
}

export const bookingBody = (
  centreId: number,
  startsAt: string,
  over: Record<string, unknown> = {},
) => ({
  centre_id: centreId,
  starts_at: startsAt,
  problem: 'toothache',
  has_emergency_symptoms: false,
  ...over,
});

/** Patient sends a booking request; returns the new appointment and visit (care request) ids. */
export async function book(
  patient: TestUser,
  centreId: number,
  startsAt: string,
  over: Record<string, unknown> = {},
) {
  const res = await api
    .post('/api/v1/appointments')
    .set(patient.auth)
    .send(bookingBody(centreId, startsAt, over));
  if (res.status !== 201) throw new Error(`book failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { apptId: res.body.data.id as number, requestId: res.body.data.care_request_id as number };
}

/** A visit (care request) created by booking at a new clinic; returns its id. */
export async function makeRequest(patient: TestUser, centreId?: number) {
  const centre = centreId ?? (await makeClinic()).centreId;
  return (await book(patient, centre, inHours(48))).requestId;
}

/**
 * Take the visit's booking through confirm → check-in → complete (the point after which estimates and
 * referrals are allowed). Uses the request's pending appointment.
 */
export async function completeVisit(
  _patient: TestUser,
  staff: TestUser,
  requestId: number,
  _providerId?: number,
) {
  const [rows] = await pool.query<Row[]>(
    `SELECT id FROM appointments WHERE care_request_id = ? AND status = 'requested' ORDER BY id LIMIT 1`,
    [requestId],
  );
  const id = rows[0]?.id as number | undefined;
  if (!id) throw new Error('completeVisit: no requested appointment on this visit');
  for (const verb of ['confirm', 'check-in', 'complete']) {
    const r = await api.post(`/api/v1/appointments/${id}/${verb}`).set(staff.auth);
    if (r.status !== 200)
      throw new Error(`completeVisit ${verb} failed: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return id;
}

/** A patient who has sent a booking request to a clinic (status `requested`). */
export async function acceptedRequest() {
  const patient = await makeUser('patient');
  const { providerId, centreId, owner: staff } = await makeClinic();
  const { apptId, requestId } = await book(patient, centreId, inHours(2));
  return { patient, providerId, centreId, staff, requestId, apptId };
}

export async function auditActions(entityType: string, entityId: number) {
  const [rows] = await pool.execute<Row[]>(
    'SELECT action FROM audit_logs WHERE entity_type = ? AND entity_id = ? ORDER BY id',
    [entityType, entityId],
  );
  return rows.map((r) => r.action as string);
}

// Fixed base (tomorrow 00:00 UTC + 1 day) so separate calls produce exactly adjacent times.
const BASE = Math.ceil(Date.now() / 86_400_000) * 86_400_000 + 86_400_000;
export const inHours = (h: number) => new Date(BASE + h * 3600_000).toISOString();
