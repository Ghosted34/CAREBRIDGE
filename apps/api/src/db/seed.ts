/**
 * Development seed: one admin, one operator, two verified Lagos dental providers
 * with an owner each, and one patient. Refuses to run in production.
 * Default password for every seeded account: CareBridge!2026 (override with SEED_PASSWORD).
 */
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { POLICIES } from '../modules/consents/policies.js';
import { pool, type Result, type Row } from './pool.js';

if (env.NODE_ENV === 'production') {
  process.stderr.write('Refusing to seed a production database.\n');
  process.exit(1);
}

const password = process.env.SEED_PASSWORD ?? 'CareBridge!2026';

async function upsertUser(full_name: string, email: string, phone: string, role: string) {
  const [existing] = await pool.execute<Row[]>('SELECT id FROM users WHERE email = ?', [email]);
  if (existing[0]) return existing[0].id as number;
  const hash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const [r] = await pool.execute<Result>(
    `INSERT INTO users(full_name, email, phone, password_hash, role, status) VALUES (?, ?, ?, ?, ?, 'active')`,
    [full_name, email, phone, hash, role],
  );
  // Seeded accounts have accepted what a real sign-up would (patients also data sharing).
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
  return r.insertId;
}

async function upsertProvider(p: {
  legal_name: string;
  display_name: string;
  registration_number: string;
  address: string;
  specialties: string[];
}) {
  const [existing] = await pool.execute<Row[]>(
    'SELECT id FROM providers WHERE registration_number = ?',
    [p.registration_number],
  );
  if (existing[0]) return existing[0].id as number;
  const [r] = await pool.execute<Result>(
    `INSERT INTO providers(legal_name, display_name, provider_type, registration_number,
       verification_status, status, city, address, specialties)
     VALUES (?, ?, 'clinic', ?, 'verified', 'active', 'Lagos', ?, ?)`,
    [p.legal_name, p.display_name, p.registration_number, p.address, JSON.stringify(p.specialties)],
  );
  return r.insertId;
}

async function upsertCentre(providerId: number, name: string, address: string, city: string) {
  const [r] = await pool.execute<Result>(
    `INSERT INTO provider_centres(provider_id, name, address, city, is_active)
     VALUES (?, ?, ?, ?, TRUE)`,
    [providerId, name, address, city],
  );
  return r.insertId as number;
}

/** Weekday schedules 09:00–17:00 with 30-minute slots, Lagos wall-clock time. */
async function seedSchedulesAndSlots(providerId: number, centreId: number) {
  for (const dayOfWeek of [1, 2, 3, 4, 5]) {
    await pool.execute(
      `INSERT INTO provider_schedules(provider_id, centre_id, day_of_week, open_time, close_time, slot_duration_minutes, is_active)
       VALUES (?, ?, ?, '09:00', '17:00', 30, TRUE)`,
      [providerId, centreId, dayOfWeek],
    );
  }
  // Bookable slots for the next 14 days, generated from the centre schedule.
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + 1); // tomorrow
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 13);
  let created = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dayOfWeek = d.getUTCDay();
    if (dayOfWeek < 1 || dayOfWeek > 5) continue;
    let slotStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9, 0));
    const dayEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 17, 0));
    while (slotStart.getTime() + 30 * 60_000 <= dayEnd.getTime()) {
      const slotEnd = new Date(slotStart.getTime() + 30 * 60_000);
      await pool.execute(
        `INSERT IGNORE INTO provider_slots(provider_id, centre_id, start_time, end_time, status)
         VALUES (?, ?, ?, ?, 'available')`,
        [providerId, centreId, slotStart, slotEnd],
      );
      created += 1;
      slotStart = slotEnd;
    }
  }
  process.stdout.write(`[seed] ${created} slots generated for centre ${centreId}\n`);
}

async function main() {
  await upsertUser('CareBridge Admin', 'admin@carebridge.local', '+2348000000001', 'admin');
  await upsertUser(
    'CareBridge Operator',
    'operator@carebridge.local',
    '+2348000000002',
    'operator',
  );
  await upsertUser('Ada Patient', 'patient@carebridge.local', '+2348000000003', 'patient');

  const clinics = [
    {
      legal_name: 'Lekki Smiles Dental Ltd (sample)',
      display_name: 'Lekki Smiles Dental',
      registration_number: 'SAMPLE-DEN-001',
      address: 'Admiralty Way, Lekki Phase 1, Lagos',
      specialties: ['dentistry', 'endodontics'],
      owner: ['Dr Lekki Owner', 'owner.lekki@carebridge.local', '+2348000000011'],
    },
    {
      legal_name: 'Ikeja Dental Centre Ltd (sample)',
      display_name: 'Ikeja Dental Centre',
      registration_number: 'SAMPLE-DEN-002',
      address: 'Allen Avenue, Ikeja, Lagos',
      specialties: ['dentistry', 'orthodontics'],
      owner: ['Dr Ikeja Owner', 'owner.ikeja@carebridge.local', '+2348000000012'],
    },
  ] as const;

  for (const c of clinics) {
    const providerId = await upsertProvider({ ...c, specialties: [...c.specialties] });
    const ownerId = await upsertUser(c.owner[0], c.owner[1], c.owner[2], 'provider_staff');
    await pool.execute(
      `INSERT IGNORE INTO provider_users(provider_id, user_id, provider_role) VALUES (?, ?, 'owner')`,
      [providerId, ownerId],
    );
    const centreId = await upsertCentre(
      providerId,
      `${c.display_name} Main Centre`,
      c.address,
      'Lagos',
    );
    await seedSchedulesAndSlots(providerId, centreId);
  }
  process.stdout.write(`[seed] done — all seeded accounts use password: ${password}\n`);
}

main()
  .catch((err) => {
    process.stderr.write(`[seed] failed: ${err instanceof Error ? err.message : err}\n`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
