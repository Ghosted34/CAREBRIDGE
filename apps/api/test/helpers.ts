import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { pool, type Result, type Row } from '../src/db/pool.js';
import { POLICIES } from '../src/modules/consents/policies.js';
import type { ProviderRole, Role } from '../src/types.js';

export const api = supertest(createApp());

const TABLES = [
  'audit_logs',
  'notifications',
  'user_consents',
  'payments',
  'service_estimates',
  'clinical_referrals',
  'appointments',
  'care_requests',
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

export const requestBody = (over: Record<string, unknown> = {}) => ({
  specialty: 'dentistry',
  service_type: 'root canal assessment',
  description: 'Persistent pain in a lower molar for three days.',
  preferred_city: 'Lagos',
  urgency: 'soon',
  has_emergency_symptoms: false,
  ...over,
});

export async function makeRequest(patient: TestUser, over: Record<string, unknown> = {}) {
  const res = await api.post('/api/v1/requests').set(patient.auth).send(requestBody(over));
  if (res.status !== 201)
    throw new Error(`makeRequest failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.id as number;
}

/**
 * Book an appointment on an accepted request and take it to `completed` — the point after which
 * clinical governance allows estimates, referrals and treatment planning (see VISIT_REQUIRED).
 */
export async function completeVisit(patient: TestUser, staff: TestUser, requestId: number) {
  const booked = await api
    .post('/api/v1/appointments')
    .set(patient.auth)
    .send({
      care_request_id: requestId,
      starts_at: inHours(24),
      ends_at: inHours(25),
      appointment_type: 'assessment',
    });
  if (booked.status !== 201)
    throw new Error(
      `completeVisit booking failed: ${booked.status} ${JSON.stringify(booked.body)}`,
    );
  const id = booked.body.data.id as number;
  for (const verb of ['confirm', 'check-in', 'complete']) {
    const r = await api.post(`/api/v1/appointments/${id}/${verb}`).set(staff.auth);
    if (r.status !== 200)
      throw new Error(`completeVisit ${verb} failed: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return id;
}

/** Patient request → patient books appointment → staff confirms. Returns ids for booking tests. */
export async function acceptedRequest() {
  const patient = await makeUser('patient');
  const providerId = await makeProvider();
  const staff = await makeStaff(providerId, 'owner');
  const requestId = await makeRequest(patient);
  const booked = await api
    .post('/api/v1/appointments')
    .set(patient.auth)
    .send({
      care_request_id: requestId,
      starts_at: inHours(2),
      ends_at: inHours(3),
      appointment_type: 'assessment',
    });
  if (booked.status !== 201)
    throw new Error(
      `acceptedRequest booking failed: ${booked.status} ${JSON.stringify(booked.body)}`,
    );
  const apptId = booked.body.data.id as number;
  return { patient, providerId, staff, requestId, apptId };
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
