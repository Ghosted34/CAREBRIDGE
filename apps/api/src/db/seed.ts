/**
 * Development/demo seed. Every record here was first entered through the app on a clean database
 * (staging run, 11 Nov 2026): sign-ups, admin approval and verification, centres, opening hours,
 * dentists and fees. The seed recreates that end state.
 *
 * Re-runnable: rows are matched by email, registration number or centre name (including names an
 * older seed used) and UPDATED to match, never duplicated. Bookings are not seeded — their times
 * would go stale; make them in the app. Refuses to run in production.
 * Password for every seeded account: CareBridge!2026 (override with SEED_PASSWORD).
 */
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { POLICIES, type ConsentType } from '../modules/consents/policies.js';
import { pool, type Result, type Row } from './pool.js';

if (env.NODE_ENV === 'production') {
  process.stderr.write('Refusing to seed a production database.\n');
  process.exit(1);
}

const password = process.env.SEED_PASSWORD ?? 'CareBridge!2026';

type Role = 'patient' | 'provider_staff' | 'operator' | 'admin';
type Kyc = {
  address_street: string;
  address_city: string;
  address_state: string;
  address_postal: string;
  date_of_birth: string;
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  id_number: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
};
type Hours = Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, [open: string, close: string]>>;
type CaregiverRole = 'dentist' | 'caregiver' | 'hygienist' | 'specialist';

// ---------------------------------------------------------------- data (as entered in staging)

const ADMIN = {
  full_name: 'CareLynk Admin',
  email: 'admin@carebridge.local',
  phone: '+2348000000001',
};
/**
 * Not entered through the app: there is no screen that creates operators yet (admins can do
 * everything operators can). Kept so the demo has an operator login.
 */
const OPERATOR = {
  full_name: 'CareLynk Operator',
  email: 'operator@carebridge.local',
  phone: '+2348000000002',
};

const PATIENT = {
  full_name: 'Ada Okafor',
  email: 'patient@carebridge.local',
  phone: '+2348000000003',
  kyc: {
    address_street: '14 Adewale Olateju Street',
    address_city: 'Ikeja',
    address_state: 'Lagos',
    address_postal: '100212',
    date_of_birth: '1990-05-15',
    gender: 'female',
    id_number: 'NIN-12345678901',
    emergency_contact_name: 'Emeka Okafor',
    emergency_contact_phone: '+2348000000099',
  } satisfies Kyc,
};

const WEEKDAYS = (open: string, close: string): Hours => ({
  1: [open, close],
  2: [open, close],
  3: [open, close],
  4: [open, close],
  5: [open, close],
});

const CLINICS: {
  legal_name: string;
  display_name: string;
  registration_number: string;
  /** Registration numbers an older seed used for this clinic. */
  formerly: string[];
  cac_number: string;
  tax_id: string;
  address: string;
  city: string;
  specialties: string[];
  owner: { full_name: string; email: string; phone: string };
  /** Clinic-wide consultation fee (NGN); none if the clinic hasn't set one. */
  fee?: number;
  centres: {
    name: string;
    formerly: string[];
    address_line: string;
    city: string;
    state: string;
    postal_code: string;
    phone: string | null;
    hours: Hours;
    caregivers: [string, CaregiverRole][];
    /** Centre-specific consultation fee, overriding the clinic-wide one. */
    fee?: number;
  }[];
}[] = [
  {
    legal_name: 'Lekki Smiles Dental Ltd',
    display_name: 'Lekki Smiles Dental',
    registration_number: 'MDCN/R/10021',
    formerly: ['SAMPLE-DEN-001'],
    cac_number: 'RC-123456',
    tax_id: 'TIN-12345678-001',
    address: '12 Admiralty Way, Lekki Phase 1',
    city: 'Lagos',
    specialties: ['dentistry', 'endodontics'],
    owner: {
      full_name: 'Dr Funmi Adebayo',
      email: 'owner.lekki@carebridge.local',
      phone: '+2348000000011',
    },
    fee: 15000,
    centres: [
      {
        name: 'Lekki Phase 1',
        formerly: ['Lekki Phase 1 Centre'],
        address_line: '12 Admiralty Way',
        city: 'Lekki',
        state: 'Lagos',
        postal_code: '106104',
        phone: '+2348000000021',
        hours: { ...WEEKDAYS('09:00', '17:00'), 6: ['10:00', '14:00'] },
        caregivers: [
          ['Dr Adaeze Okafor', 'dentist'],
          ['Dr Kunle Bello', 'specialist'],
        ],
      },
      {
        name: 'Victoria Island',
        formerly: ['Victoria Island Centre'],
        address_line: '5 Ahmadu Bello Way',
        city: 'Victoria Island',
        state: 'Lagos',
        postal_code: '101241',
        phone: '+2348000000022',
        hours: WEEKDAYS('09:00', '17:00'),
        caregivers: [['Dr Ngozi Eze', 'dentist']],
        fee: 20000,
      },
    ],
  },
  {
    legal_name: 'Ikeja Dental Centre Ltd',
    display_name: 'Ikeja Dental Centre',
    registration_number: 'MDCN/R/10045',
    formerly: ['SAMPLE-DEN-002'],
    cac_number: 'RC-789012',
    tax_id: 'TIN-78901234-002',
    address: '24 Allen Avenue, Ikeja',
    city: 'Lagos',
    specialties: ['dentistry', 'orthodontics'],
    owner: {
      full_name: 'Dr Tunde Adeyemi',
      email: 'owner.ikeja@carebridge.local',
      phone: '+2348000000012',
    },
    fee: 12000,
    centres: [
      {
        name: 'Allen Avenue',
        formerly: ['Ikeja Main Centre'],
        address_line: '24 Allen Avenue',
        city: 'Ikeja',
        state: 'Lagos',
        postal_code: '100212',
        phone: '+2348000000031',
        hours: { ...WEEKDAYS('08:00', '18:00'), 6: ['10:00', '14:00'] },
        caregivers: [['Dr Tunde Adeyemi', 'dentist']],
      },
    ],
  },
  {
    legal_name: 'Capital Dental Clinic Ltd',
    display_name: 'Capital Dental Clinic',
    registration_number: 'MDCN/R/20017',
    formerly: ['SAMPLE-DEN-003'],
    cac_number: 'RC-345678',
    tax_id: 'TIN-34567890-003',
    address: '8 Aminu Kano Crescent, Wuse 2',
    city: 'Abuja',
    specialties: ['dentistry', 'periodontics'],
    owner: {
      full_name: 'Dr Hauwa Musa',
      email: 'owner.abuja@carebridge.local',
      phone: '+2348000000013',
    },
    fee: 18000,
    centres: [
      {
        name: 'Wuse 2',
        formerly: [],
        address_line: '8 Aminu Kano Crescent',
        city: 'Wuse',
        state: 'FCT',
        postal_code: '904101',
        phone: '+2348000000041',
        hours: WEEKDAYS('09:00', '17:00'),
        caregivers: [['Dr Hauwa Musa', 'dentist']],
      },
    ],
  },
  {
    // Added 11 Nov 2026 to re-check self-registration after the approval fix: signed up at /register,
    // verified by the admin (which activated the owner), then the owner added the centre and hours,
    // and later added its phone with "Edit centre".
    // No dentists or fee yet — that's how it was left.
    legal_name: 'Yaba Dental Ltd',
    display_name: 'Yaba Dental',
    registration_number: 'MDCN/R/30001',
    formerly: [],
    cac_number: 'RC-300001',
    tax_id: 'TIN-30000001-001',
    address: '3 Herbert Macaulay Way, Yaba',
    city: 'Lagos',
    specialties: ['dentistry'],
    owner: {
      full_name: 'Dr Yemi Ade',
      email: 'owner.yaba@carebridge.local',
      phone: '+2348000000014',
    },
    centres: [
      {
        name: 'Herbert Macaulay',
        formerly: [],
        address_line: '3 Herbert Macaulay Way',
        city: 'Yaba',
        state: 'Lagos',
        postal_code: '101245',
        phone: '+2348000000051', // added later with "Edit centre"
        hours: WEEKDAYS('09:00', '17:00'),
        caregivers: [],
      },
    ],
  },
];

// ---------------------------------------------------------------- upserts

async function upsertUser(
  u: { full_name: string; email: string; phone: string; kyc?: Kyc },
  role: Role,
  consents: { type: ConsentType; source: 'registration' | 'request_form' }[],
): Promise<number> {
  const k = u.kyc;
  const kycValues = [
    k?.address_street ?? null,
    k?.address_city ?? null,
    k?.address_state ?? null,
    k?.address_postal ?? null,
    k?.date_of_birth ?? null,
    k?.gender ?? null,
    k?.id_number ?? null,
    k?.emergency_contact_name ?? null,
    k?.emergency_contact_phone ?? null,
  ];
  const hash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const [existing] = await pool.execute<Row[]>('SELECT id FROM users WHERE email = ?', [u.email]);
  let id: number;
  if (existing[0]) {
    id = existing[0].id as number;
    await pool.execute(
      `UPDATE users SET full_name = ?, phone = ?, password_hash = ?, role = ?, status = 'active',
         address_street = ?, address_city = ?, address_state = ?, address_postal = ?,
         date_of_birth = ?, gender = ?, id_number = ?, emergency_contact_name = ?,
         emergency_contact_phone = ?
       WHERE id = ?`,
      [u.full_name, u.phone, hash, role, ...kycValues, id],
    );
  } else {
    const [r] = await pool.execute<Result>(
      `INSERT INTO users(full_name, email, phone, password_hash, role, status,
         address_street, address_city, address_state, address_postal,
         date_of_birth, gender, id_number, emergency_contact_name, emergency_contact_phone)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [u.full_name, u.email, u.phone, hash, role, ...kycValues],
    );
    id = r.insertId;
  }
  // Consents as the staged accounts gave them, at the current policy versions. Consent history is
  // append-only, so add a row only when the current version isn't already granted.
  for (const c of consents) {
    const version = POLICIES[c.type].version;
    const [has] = await pool.execute<Row[]>(
      `SELECT granted FROM user_consents WHERE user_id = ? AND consent_type = ? AND version = ?
        ORDER BY id DESC LIMIT 1`,
      [id, c.type, version],
    );
    if (!has[0]?.granted) {
      await pool.execute(
        `INSERT INTO user_consents(user_id, consent_type, version, granted, source) VALUES (?, ?, ?, TRUE, ?)`,
        [id, c.type, version, c.source],
      );
    }
  }
  return id;
}

async function upsertProvider(p: (typeof CLINICS)[number]): Promise<number> {
  const numbers = [p.registration_number, ...p.formerly];
  const [existing] = await pool.query<Row[]>(
    'SELECT id FROM providers WHERE registration_number IN (?) ORDER BY id LIMIT 1',
    [numbers],
  );
  const values = [
    p.legal_name,
    p.display_name,
    p.registration_number,
    p.cac_number,
    p.tax_id,
    p.city,
    p.address,
    JSON.stringify(p.specialties),
  ];
  if (existing[0]) {
    const id = existing[0].id as number;
    await pool.execute(
      `UPDATE providers SET legal_name = ?, display_name = ?, registration_number = ?, cac_number = ?,
         tax_id = ?, city = ?, address = ?, specialties = ?, provider_type = 'clinic',
         verification_status = 'verified', status = 'active'
       WHERE id = ?`,
      [...values, id],
    );
    return id;
  }
  const [r] = await pool.execute<Result>(
    `INSERT INTO providers(legal_name, display_name, registration_number, cac_number, tax_id,
       city, address, specialties, provider_type, verification_status, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'clinic', 'verified', 'active')`,
    values,
  );
  return r.insertId;
}

async function upsertCentre(
  providerId: number,
  c: (typeof CLINICS)[number]['centres'][number],
): Promise<number> {
  const [existing] = await pool.query<Row[]>(
    'SELECT id FROM provider_centres WHERE provider_id = ? AND name IN (?) ORDER BY id LIMIT 1',
    [providerId, [c.name, ...c.formerly]],
  );
  const values = [c.name, c.address_line, c.city, c.state, c.postal_code, c.phone];
  if (existing[0]) {
    const id = existing[0].id as number;
    await pool.execute(
      `UPDATE provider_centres SET name = ?, address_line = ?, city = ?, state = ?, postal_code = ?,
         phone = ?, is_active = TRUE
       WHERE id = ?`,
      [...values, id],
    );
    return id;
  }
  const [r] = await pool.execute<Result>(
    `INSERT INTO provider_centres(provider_id, name, address_line, city, state, postal_code, phone)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [providerId, ...values],
  );
  return r.insertId;
}

/** Opening hours replace whatever the centre had (same as saving them in the app). */
async function setHours(providerId: number, centreId: number, hours: Hours) {
  await pool.execute('DELETE FROM provider_schedules WHERE provider_id = ? AND centre_id = ?', [
    providerId,
    centreId,
  ]);
  for (const [day, [open, close]] of Object.entries(hours) as [string, [string, string]][]) {
    await pool.execute(
      `INSERT INTO provider_schedules(provider_id, centre_id, day_of_week, open_time, close_time,
         slot_duration_minutes, is_active)
       VALUES (?, ?, ?, ?, ?, 30, TRUE)`,
      [providerId, centreId, Number(day), open, close],
    );
  }
}

async function upsertCaregiver(
  providerId: number,
  centreId: number,
  full_name: string,
  role: CaregiverRole,
) {
  const [existing] = await pool.execute<Row[]>(
    'SELECT id FROM provider_caregivers WHERE provider_id = ? AND centre_id = ? AND full_name = ?',
    [providerId, centreId, full_name],
  );
  if (existing[0]) {
    await pool.execute('UPDATE provider_caregivers SET role = ?, is_active = TRUE WHERE id = ?', [
      role,
      existing[0].id,
    ]);
    return;
  }
  await pool.execute(
    `INSERT INTO provider_caregivers(provider_id, centre_id, full_name, role, is_active)
     VALUES (?, ?, ?, ?, TRUE)`,
    [providerId, centreId, full_name, role],
  );
}

async function upsertConsultationFee(providerId: number, centreId: number | null, amount: number) {
  const [existing] = await pool.execute<Row[]>(
    `SELECT id FROM provider_fees
      WHERE provider_id = ? AND fee_type = 'consultancy' AND centre_id <=> ? ORDER BY id LIMIT 1`,
    [providerId, centreId],
  );
  if (existing[0]) {
    await pool.execute(
      `UPDATE provider_fees SET amount = ?, currency = 'NGN', is_active = TRUE WHERE id = ?`,
      [amount, existing[0].id],
    );
    return;
  }
  await pool.execute(
    `INSERT INTO provider_fees(provider_id, centre_id, fee_type, amount, currency)
     VALUES (?, ?, 'consultancy', ?, 'NGN')`,
    [providerId, centreId, amount],
  );
}

// ---------------------------------------------------------------- run

async function main() {
  const atSignUp = [
    { type: 'terms', source: 'registration' },
    { type: 'privacy', source: 'registration' },
  ] as const;
  await upsertUser(ADMIN, 'admin', []);
  await upsertUser(OPERATOR, 'operator', []);
  // Data sharing was given on the booking form, as in staging.
  await upsertUser(PATIENT, 'patient', [
    ...atSignUp,
    { type: 'data_sharing', source: 'request_form' },
  ]);

  for (const clinic of CLINICS) {
    const providerId = await upsertProvider(clinic);
    const ownerId = await upsertUser(clinic.owner, 'provider_staff', [...atSignUp]);
    await pool.execute(
      `INSERT INTO provider_users(provider_id, user_id, provider_role) VALUES (?, ?, 'owner')
       ON DUPLICATE KEY UPDATE provider_role = 'owner'`,
      [providerId, ownerId],
    );
    if (clinic.fee) await upsertConsultationFee(providerId, null, clinic.fee);
    for (const centre of clinic.centres) {
      const centreId = await upsertCentre(providerId, centre);
      await setHours(providerId, centreId, centre.hours);
      for (const [name, role] of centre.caregivers) {
        await upsertCaregiver(providerId, centreId, name, role);
      }
      if (centre.fee) await upsertConsultationFee(providerId, centreId, centre.fee);
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
