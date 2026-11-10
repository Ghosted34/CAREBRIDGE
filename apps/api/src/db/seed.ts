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

async function upsertUser(
  full_name: string,
  email: string,
  phone: string,
  role: string,
  kyc?: {
    address_street?: string;
    address_city?: string;
    address_state?: string;
    address_postal?: string;
    date_of_birth?: string;
    gender?: string;
    id_number?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
  },
) {
  const [existing] = await pool.execute<Row[]>('SELECT id FROM users WHERE email = ?', [email]);
  if (existing[0]) return existing[0].id as number;
  const hash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const [r] = await pool.execute<Result>(
    `INSERT INTO users(full_name, email, phone, password_hash, role, status,
       address_street, address_city, address_state, address_postal,
       date_of_birth, gender, id_number, emergency_contact_name, emergency_contact_phone)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      full_name,
      email,
      phone,
      hash,
      role,
      kyc?.address_street ?? null,
      kyc?.address_city ?? null,
      kyc?.address_state ?? null,
      kyc?.address_postal ?? null,
      kyc?.date_of_birth ?? null,
      kyc?.gender ?? null,
      kyc?.id_number ?? null,
      kyc?.emergency_contact_name ?? null,
      kyc?.emergency_contact_phone ?? null,
    ],
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
  cac_number: string;
  tax_id: string;
  address: string;
  city: string;
  specialties: string[];
}) {
  const [existing] = await pool.execute<Row[]>(
    'SELECT id FROM providers WHERE registration_number = ?',
    [p.registration_number],
  );
  if (existing[0]) return existing[0].id as number;
  const [r] = await pool.execute<Result>(
    `INSERT INTO providers(legal_name, display_name, provider_type, registration_number,
       cac_number, tax_id, verification_status, status, city, address, specialties)
     VALUES (?, ?, 'clinic', ?, ?, ?, 'verified', 'active', ?, ?, ?)`,
    [
      p.legal_name,
      p.display_name,
      p.registration_number,
      p.cac_number,
      p.tax_id,
      p.city,
      p.address,
      JSON.stringify(p.specialties),
    ],
  );
  return r.insertId;
}

async function upsertCentre(
  providerId: number,
  centre: {
    name: string;
    address_line: string;
    city: string;
    state: string;
    postal_code: string;
    phone: string | null;
  },
): Promise<number> {
  const [existing] = await pool.execute<Row[]>(
    'SELECT id FROM provider_centres WHERE provider_id = ? AND name = ?',
    [providerId, centre.name],
  );
  if (existing[0]) return existing[0].id as number;
  const [r] = await pool.execute<Result>(
    `INSERT INTO provider_centres (provider_id, name, address_line, city, state, postal_code, phone)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      providerId,
      centre.name,
      centre.address_line,
      centre.city,
      centre.state,
      centre.postal_code,
      centre.phone,
    ],
  );
  return r.insertId;
}

async function upsertSchedules(
  providerId: number,
  centreId: number,
  schedules: {
    day_of_week: number;
    open_time: string;
    close_time: string;
    slot_duration_minutes?: number;
  }[],
) {
  await pool.execute(`DELETE FROM provider_schedules WHERE provider_id = ? AND centre_id = ?`, [
    providerId,
    centreId,
  ]);
  for (const s of schedules) {
    await pool.execute(
      `INSERT INTO provider_schedules (provider_id, centre_id, day_of_week, open_time, close_time, slot_duration_minutes, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        providerId,
        centreId,
        s.day_of_week,
        s.open_time,
        s.close_time,
        s.slot_duration_minutes ?? 30,
      ],
    );
  }
}

async function upsertSlots(
  providerId: number,
  centreId: number,
  slots: { start_time: string; end_time: string; price: number; currency: string }[],
): Promise<number> {
  let count = 0;
  for (const s of slots) {
    const [existing] = await pool.execute<Row[]>(
      'SELECT id FROM provider_slots WHERE provider_id = ? AND centre_id = ? AND start_time = ?',
      [providerId, centreId, s.start_time],
    );
    if (existing[0]) continue;
    await pool.execute(
      `INSERT INTO provider_slots (provider_id, centre_id, start_time, end_time, status, price, currency)
       VALUES (?, ?, ?, ?, 'available', ?, ?)`,
      [providerId, centreId, s.start_time, s.end_time, s.price, s.currency],
    );
    count++;
  }
  return count;
}

async function upsertCaregiver(
  providerId: number,
  centreId: number,
  full_name: string,
  role: 'dentist' | 'caregiver' | 'hygienist' | 'specialist',
): Promise<number> {
  const [existing] = await pool.execute<Row[]>(
    'SELECT id FROM provider_caregivers WHERE provider_id = ? AND centre_id = ? AND full_name = ?',
    [providerId, centreId, full_name],
  );
  if (existing[0]) return existing[0].id as number;
  const [r] = await pool.execute<Result>(
    `INSERT INTO provider_caregivers (provider_id, centre_id, full_name, role, is_active)
     VALUES (?, ?, ?, ?, 1)`,
    [providerId, centreId, full_name, role],
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
  await upsertUser('Ada Patient', 'patient@carebridge.local', '+2348000000003', 'patient', {
    address_street: '14 Adewale Olateju Street',
    address_city: 'Ikeja',
    address_state: 'Lagos',
    address_postal: '100212',
    date_of_birth: '1990-05-15',
    gender: 'female',
    id_number: 'Lagos-12345678',
    emergency_contact_name: 'Emeka Patient',
    emergency_contact_phone: '+2348000000099',
  });

  const clinics = [
    {
      legal_name: 'Lekki Smiles Dental Ltd (sample)',
      display_name: 'Lekki Smiles Dental',
      registration_number: 'SAMPLE-DEN-001',
      cac_number: 'RC-123456',
      tax_id: 'TIN-12345678-001',
      address: 'Admiralty Way, Lekki Phase 1, Lagos',
      city: 'Lagos',
      specialties: ['dentistry', 'endodontics'],
      owner: ['Dr Lekki Owner', 'owner.lekki@carebridge.local', '+2348000000011'],
      centres: [
        {
          name: 'Lekki Phase 1 Centre',
          address_line: '12 Admiralty Way',
          city: 'Lagos',
          state: 'Lagos',
          postal_code: '106104',
          phone: '+2348000000021',
        },
        {
          name: 'Victoria Island Centre',
          address_line: '5 Ahmadu Bello Way',
          city: 'Lagos',
          state: 'Lagos',
          postal_code: '101241',
          phone: '+2348000000022',
        },
      ],
      caregivers: [
        {
          centre: 'Lekki Phase 1 Centre',
          full_name: 'Dr Adaeze Dentist',
          role: 'dentist' as const,
        },
        { centre: 'Lekki Phase 1 Centre', full_name: 'Nurse Chioma', role: 'caregiver' as const },
      ],
    },
    {
      legal_name: 'Ikeja Dental Centre Ltd (sample)',
      display_name: 'Ikeja Dental Centre',
      registration_number: 'SAMPLE-DEN-002',
      cac_number: 'RC-789012',
      tax_id: 'TIN-78901234-002',
      address: 'Allen Avenue, Ikeja, Lagos',
      city: 'Lagos',
      specialties: ['dentistry', 'orthodontics'],
      owner: ['Dr Ikeja Owner', 'owner.ikeja@carebridge.local', '+2348000000012'],
      centres: [
        {
          name: 'Ikeja Main Centre',
          address_line: '24 Allen Avenue',
          city: 'Lagos',
          state: 'Lagos',
          postal_code: '100212',
          phone: '+2348000000031',
        },
      ],
      caregivers: [
        { centre: 'Ikeja Main Centre', full_name: 'Dr Tunde Dental', role: 'dentist' as const },
      ],
    },
  ] as const;

  for (const c of clinics) {
    const providerId = await upsertProvider({ ...c, specialties: [...c.specialties] });
    const ownerId = await upsertUser(c.owner[0], c.owner[1], c.owner[2], 'provider_staff');
    await pool.execute(
      `INSERT IGNORE INTO provider_users(provider_id, user_id, provider_role) VALUES (?, ?, 'owner')`,
      [providerId, ownerId],
    );

    for (const centre of c.centres) {
      const centreId = await upsertCentre(providerId, centre);

      // Mon-Sat, 9am-5pm, 30-min slots
      await upsertSchedules(providerId, centreId, [
        { day_of_week: 1, open_time: '09:00:00', close_time: '17:00:00' },
        { day_of_week: 2, open_time: '09:00:00', close_time: '17:00:00' },
        { day_of_week: 3, open_time: '09:00:00', close_time: '17:00:00' },
        { day_of_week: 4, open_time: '09:00:00', close_time: '17:00:00' },
        { day_of_week: 5, open_time: '09:00:00', close_time: '17:00:00' },
        { day_of_week: 6, open_time: '09:00:00', close_time: '14:00:00' },
      ]);

      // Generate slots for the next 14 days from today
      const today = new Date();
      const startDate = today.toISOString().slice(0, 10);
      const endDate = new Date(today.getTime() + 14 * 24 * 3600_000).toISOString().slice(0, 10);

      const slots: { start_time: string; end_time: string; price: number; currency: string }[] = [];
      const current = new Date(`${startDate}T00:00:00Z`);
      const end = new Date(`${endDate}T23:59:59Z`);
      while (current <= end) {
        const dayOfWeek = current.getUTCDay();
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
          // Weekday: 9am-5pm
          let slotStart = new Date(
            Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate(), 9, 0),
          );
          while (
            slotStart.getTime() + 30 * 60_000 <=
            new Date(
              Date.UTC(
                current.getUTCFullYear(),
                current.getUTCMonth(),
                current.getUTCDate(),
                17,
                0,
              ),
            ).getTime()
          ) {
            const slotEnd = new Date(slotStart.getTime() + 30 * 60_000);
            slots.push({
              start_time: slotStart.toISOString(),
              end_time: slotEnd.toISOString(),
              price: 15000,
              currency: 'NGN',
            });
            slotStart = slotEnd;
          }
        } else if (dayOfWeek === 6) {
          // Saturday: 9am-2pm
          let slotStart = new Date(
            Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate(), 9, 0),
          );
          while (
            slotStart.getTime() + 30 * 60_000 <=
            new Date(
              Date.UTC(
                current.getUTCFullYear(),
                current.getUTCMonth(),
                current.getUTCDate(),
                14,
                0,
              ),
            ).getTime()
          ) {
            const slotEnd = new Date(slotStart.getTime() + 30 * 60_000);
            slots.push({
              start_time: slotStart.toISOString(),
              end_time: slotEnd.toISOString(),
              price: 15000,
              currency: 'NGN',
            });
            slotStart = slotEnd;
          }
        }
        current.setUTCDate(current.getUTCDate() + 1);
      }

      await upsertSlots(providerId, centreId, slots);

      for (const cg of c.caregivers) {
        if (cg.centre === centre.name) {
          await upsertCaregiver(providerId, centreId, cg.full_name, cg.role);
        }
      }
    }
  }

  process.stdout.write(`[seed] done — all seeded accounts use password: ${password}\n`);
}

main()
  .catch((err) => {
    process.stderr.write(`[seed] failed: ${err instanceof Error ? err.message : err}\n`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
