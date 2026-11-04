/**
 * Development seed: one admin, one operator, two verified Lagos dental providers
 * with an owner each, and one patient. Refuses to run in production.
 * Default password for every seeded account: CareBridge!2026 (override with SEED_PASSWORD).
 */
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
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
  }
  process.stdout.write(`[seed] done — all seeded accounts use password: ${password}\n`);
}

main()
  .catch((err) => {
    process.stderr.write(`[seed] failed: ${err instanceof Error ? err.message : err}\n`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
