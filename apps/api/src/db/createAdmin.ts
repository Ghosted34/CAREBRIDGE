/**
 * Create (or re-activate) a OnDiGoH admin — the only way the first admin exists, since sign-up
 * offers patient and clinic accounts only. Safe in production; idempotent by email.
 *
 *   ADMIN_EMAIL=… ADMIN_NAME=… ADMIN_PHONE=… ADMIN_PASSWORD=… npm run admin:create
 *   (built: npm run admin:create:prod)
 */
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../config/env.js';
import { pool, type Row } from './pool.js';

const Input = z.object({
  ADMIN_EMAIL: z.email(),
  ADMIN_NAME: z.string().trim().min(2),
  ADMIN_PHONE: z.string().regex(/^\+234\d{10}$/, 'Use +234XXXXXXXXXX'),
  ADMIN_PASSWORD: z.string().min(10, 'At least 10 characters'),
});

async function main() {
  const parsed = Input.safeParse(process.env);
  if (!parsed.success) {
    process.stderr.write(
      `[admin] ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}\n`,
    );
    process.exitCode = 1;
    return;
  }
  const {
    ADMIN_EMAIL: email,
    ADMIN_NAME: name,
    ADMIN_PHONE: phone,
    ADMIN_PASSWORD: pw,
  } = parsed.data;
  const hash = await bcrypt.hash(pw, env.BCRYPT_ROUNDS);
  const [existing] = await pool.execute<Row[]>('SELECT id, role FROM users WHERE email = ?', [
    email.toLowerCase(),
  ]);
  if (existing[0]) {
    if (existing[0].role !== 'admin') {
      process.stderr.write(`[admin] ${email} exists with role ${existing[0].role}; not changed\n`);
      process.exitCode = 1;
      return;
    }
    await pool.execute(`UPDATE users SET password_hash = ?, status = 'active' WHERE id = ?`, [
      hash,
      existing[0].id,
    ]);
    process.stdout.write(`[admin] ${email} already an admin: password reset, account active\n`);
    return;
  }
  await pool.execute(
    `INSERT INTO users(full_name, email, phone, password_hash, role, status)
     VALUES (?, ?, ?, ?, 'admin', 'active')`,
    [name, email.toLowerCase(), phone, hash],
  );
  process.stdout.write(`[admin] created ${email}\n`);
}

main()
  .catch((err) => {
    process.stderr.write(`[admin] failed: ${err instanceof Error ? err.message : err}\n`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
