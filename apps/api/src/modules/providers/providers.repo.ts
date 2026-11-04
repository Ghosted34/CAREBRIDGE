import type { Db, Row } from '../../db/pool.js';
import type { Pagination } from '../../lib/validate.js';

// Only these fields are ever exposed publicly.
const PUBLIC_FIELDS = `p.id, p.display_name, p.provider_type, p.city, p.address,
  p.specialties, p.services, p.accepting_referrals`;

export async function listVerified(db: Db, f: { city: string; specialty: string } & Pagination) {
  // LIMIT/OFFSET placeholders need .query(), not .execute(), in mysql2.
  const [rows] = await db.query<Row[]>(
    `SELECT ${PUBLIC_FIELDS} FROM providers p
      WHERE p.verification_status = 'verified' AND p.status = 'active'
        AND p.city = ? AND JSON_CONTAINS(p.specialties, JSON_QUOTE(?))
      ORDER BY p.display_name LIMIT ? OFFSET ?`,
    [f.city, f.specialty, f.limit, f.offset],
  );
  return rows;
}

export async function findVerified(db: Db, id: number) {
  const [rows] = await db.execute<Row[]>(
    `SELECT ${PUBLIC_FIELDS} FROM providers p
      WHERE p.id = ? AND p.verification_status = 'verified' AND p.status = 'active'`,
    [id],
  );
  return rows[0];
}
