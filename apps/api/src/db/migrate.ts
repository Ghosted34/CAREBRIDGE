/**
 * Migration CLI.
 *
 *   npm run migrate                      apply pending migrations
 *   npm run migrate:status               show applied / pending / problems
 *   npm run migrate:down -- --steps 1    roll back the newest migration(s)
 *   npm run migrate:new -- add_x_to_y    create a new timestamped migration file
 *   npm run migrate:verify               check file names/format only (no database; used in CI)
 *
 * Flags: --allow-out-of-order (up), --steps N and --yes (down; --yes is required in production).
 */
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';
import { FILE_PATTERN, loadMigrations, MigrationError, Migrator } from './migrator.js';

export const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

const out = (m: string) => process.stdout.write(`[migrate] ${m}\n`);

function flag(args: string[], name: string) {
  return args.includes(name);
}
function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function connect() {
  const { env } = await import('../config/env.js');
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    timezone: 'Z',
  });
  await conn.query("SET time_zone = '+00:00'");
  return { conn, env };
}

function timestamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

async function createFile(name: string | undefined) {
  if (!name || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(name)) {
    throw new MigrationError(
      'Usage: npm run migrate:new -- <snake_case_name>, e.g. add_notes_to_appointments',
    );
  }
  const existing = new Set((await loadMigrations(MIGRATIONS_DIR)).map((m) => m.version));
  const newest = [...existing].sort().at(-1) ?? '0';
  let version = timestamp();
  // Same minute or a clock behind the newest file: bump so ordering stays strictly increasing.
  while (existing.has(version) || version <= newest) version = String(Number(version) + 1);
  const file = `${version}_${name}.sql`;
  if (!FILE_PATTERN.test(file)) throw new MigrationError(`Generated an invalid file name: ${file}`);
  const full = path.join(MIGRATIONS_DIR, file);
  if (existsSync(full)) throw new MigrationError(`${file} already exists`);
  await writeFile(
    full,
    `-- TODO: one line on why this change is needed.\n\n-- migrate:up\n\n\n-- migrate:down\n\n`,
  );
  out(`created src/db/migrations/${file}`);
}

async function main() {
  const [command = 'up', ...args] = process.argv.slice(2);

  if (command === 'new') return createFile(args[0]);
  if (command === 'verify') {
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    const irreversible = migrations.filter((m) => m.down.length === 0).map((m) => m.file);
    if (irreversible.length) out(`warning: no down section in ${irreversible.join(', ')}`);
    return out(`${migrations.length} migration files OK`);
  }

  const { conn, env } = await connect();
  const migrator = new Migrator(conn, {
    dir: MIGRATIONS_DIR,
    log: out,
    allowOutOfOrder: flag(args, '--allow-out-of-order'),
  });
  try {
    if (command === 'up') {
      const applied = await migrator.up();
      out(applied.length ? `done, ${applied.length} applied` : 'already up to date');
    } else if (command === 'status') {
      const s = await migrator.status();
      for (const a of s.applied) out(`applied  ${a.version}_${a.name}`);
      for (const p of s.pending) out(`pending  ${p.file}`);
      for (const p of s.problems) out(`PROBLEM  ${p}`);
      if (s.problems.length) process.exitCode = 1;
    } else if (command === 'down') {
      if (env.NODE_ENV === 'production' && !flag(args, '--yes')) {
        throw new MigrationError('Rolling back in production needs --yes (and a fresh backup)');
      }
      const steps = Number(option(args, '--steps') ?? 1);
      const reverted = await migrator.down(steps);
      out(`done, ${reverted.length} rolled back`);
    } else {
      throw new MigrationError(
        `Unknown command "${command}". Use up | status | down | new | verify`,
      );
    }
  } finally {
    await conn.end();
  }
}

// Only run when executed directly (tests import MIGRATIONS_DIR from this file).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    const msg =
      err instanceof MigrationError ? err.message : err instanceof Error ? err.stack : String(err);
    process.stderr.write(`[migrate] failed: ${msg}\n`);
    process.exit(1);
  });
}
