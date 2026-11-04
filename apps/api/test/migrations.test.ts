import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../src/db/migrate.js';
import {
  loadMigrations,
  MigrationError,
  Migrator,
  parseMigration,
  splitStatements,
} from '../src/db/migrator.js';
import { adminConnection } from './globalSetup.js';

// A separate scratch database so these tests never touch carebridge_test.
const DB = 'carebridge_migrations_test';
let conn: Connection;
let dir: string; // per-test copy of the real migrations folder, safe to tamper with

async function tables() {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`,
    [DB],
  );
  return rows.map((r) => r.t as string);
}

beforeAll(async () => {
  conn = await adminConnection();
});
afterAll(async () => {
  await conn.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await conn.end();
});
beforeEach(async () => {
  await conn.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await conn.query(`CREATE DATABASE \`${DB}\``);
  await conn.changeUser({ database: DB });
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = await mkdtemp(path.join(tmpdir(), 'cb-migrations-'));
  await cp(MIGRATIONS_DIR, dir, { recursive: true });
});

describe('migration files', () => {
  it('all parse, have unique ordered versions, and every one is reversible', async () => {
    const all = await loadMigrations(MIGRATIONS_DIR);
    expect(all.length).toBeGreaterThanOrEqual(18);
    expect(all.map((m) => m.version)).toEqual([...all.map((m) => m.version)].sort());
    for (const m of all) expect(m.down.length, `${m.file} needs a down section`).toBeGreaterThan(0);
  });

  it('table creations come before updates, one table per create migration', async () => {
    const all = await loadMigrations(MIGRATIONS_DIR);
    const creates = all.filter((m) => m.name.startsWith('create_'));
    for (const m of creates) {
      expect(m.up).toHaveLength(1);
      expect(m.up[0]).toMatch(new RegExp(`^CREATE TABLE ${m.name.replace(/^create_/, '')} \\(`));
    }
  });

  it('rejects bad names and missing sections', () => {
    expect(() => parseMigration('1_x.sql', '-- migrate:up\nSELECT 1;\n-- migrate:down\n')).toThrow(
      MigrationError,
    );
    expect(() => parseMigration('202611041200_x.sql', 'SELECT 1;')).toThrow(/migrate:up/);
    expect(() =>
      parseMigration('202611041200_x.sql', '-- migrate:up\n-- migrate:down\nSELECT 1;'),
    ).toThrow(/empty/);
  });

  it('checksums ignore CRLF line endings (Windows checkouts)', () => {
    const lf = '-- migrate:up\nCREATE TABLE t (id INT);\n\n-- migrate:down\nDROP TABLE t;\n';
    const a = parseMigration('202611041200_x.sql', lf);
    const b = parseMigration('202611041200_x.sql', lf.replace(/\n/g, '\r\n'));
    expect(a.checksum).toBe(b.checksum);
  });

  it('splits statements and drops comment lines', () => {
    expect(splitStatements('-- a comment; with semicolon\nSELECT 1;\nSELECT 2;\n')).toEqual([
      'SELECT 1',
      'SELECT 2',
    ]);
  });
});

describe('Migrator', () => {
  it('applies everything from an empty database, then is a no-op', async () => {
    const m = new Migrator(conn, { dir });
    const applied = await m.up();
    expect(applied.length).toBeGreaterThanOrEqual(18);
    expect(await tables()).toEqual(
      expect.arrayContaining([
        'users',
        'providers',
        'care_requests',
        'audit_logs',
        'schema_migrations',
      ]),
    );
    expect(await m.up()).toEqual([]);
    const s = await m.status();
    expect(s.pending).toEqual([]);
    expect(s.problems).toEqual([]);
  });

  it('rolls back step by step and all the way down, then back up (full round trip)', async () => {
    const m = new Migrator(conn, { dir });
    const applied = await m.up();
    expect(await m.down(1)).toEqual([applied.at(-1)]);
    expect((await m.status()).pending).toHaveLength(1);
    await m.down(applied.length - 1);
    expect(await tables()).toEqual(['schema_migrations']);
    expect((await m.up()).length).toBe(applied.length);
  });

  it('refuses to run when an applied migration was edited', async () => {
    const m = new Migrator(conn, { dir });
    await m.up();
    const file = path.join(dir, '202611041000_create_users.sql');
    await writeFile(file, (await readFile(file, 'utf8')).replace('VARCHAR(160)', 'VARCHAR(200)'));
    await expect(m.up()).rejects.toThrow(/changed after it was applied/);
  });

  it('refuses when an applied migration file is missing', async () => {
    const m = new Migrator(conn, { dir });
    await m.up();
    await rm(path.join(dir, '202611041105_add_metadata_to_audit_logs.sql'));
    await expect(m.up()).rejects.toThrow(/file is missing/);
  });

  it('refuses an out-of-order migration unless explicitly allowed', async () => {
    await new Migrator(conn, { dir }).up();
    await writeFile(
      path.join(dir, '202611041050_add_late_column.sql'),
      '-- migrate:up\nALTER TABLE users ADD COLUMN late_flag BOOLEAN NULL;\n\n-- migrate:down\nALTER TABLE users DROP COLUMN late_flag;\n',
    );
    await expect(new Migrator(conn, { dir }).up()).rejects.toThrow(/older than the newest applied/);
    expect(await new Migrator(conn, { dir, allowOutOfOrder: true }).up()).toEqual([
      '202611041050_add_late_column.sql',
    ]);
  });

  it('does not record a migration whose statement fails, and says what happened', async () => {
    await new Migrator(conn, { dir }).up();
    await writeFile(
      path.join(dir, '209901010000_broken.sql'),
      '-- migrate:up\nALTER TABLE users ADD COLUMN ok_col INT NULL;\nALTER TABLE nope ADD COLUMN x INT;\n\n-- migrate:down\nALTER TABLE users DROP COLUMN ok_col;\n',
    );
    const err = await new Migrator(conn, { dir }).up().catch((e: Error) => e);
    expect(err).toBeInstanceOf(MigrationError);
    expect((err as Error).message).toMatch(/failed at statement 2\/2.*already ran/s);
    const s = await new Migrator(conn, { dir }).status();
    expect(s.pending.map((p) => p.file)).toEqual(['209901010000_broken.sql']);
  });

  it('detects a database migrated by the old runner and explains what to do', async () => {
    await conn.query(
      'CREATE TABLE schema_migrations (version VARCHAR(190) PRIMARY KEY, applied_at TIMESTAMP)',
    );
    await conn.query(`INSERT INTO schema_migrations(version) VALUES ('001_initial_schema.sql')`);
    await expect(new Migrator(conn, { dir }).up()).rejects.toThrow(/old migration runner/);
  });

  it('enforces the schema rules it creates (e.g. appointment end after start)', async () => {
    await new Migrator(conn, { dir }).up();
    await conn.query(
      `INSERT INTO users(full_name,email,phone,password_hash) VALUES ('a','a@a','1','x')`,
    );
    await conn.query(`INSERT INTO providers(legal_name,display_name,provider_type,registration_number,city,address,specialties)
                      VALUES ('p','p','clinic','r','Lagos','addr','["dentistry"]')`);
    await conn.query(
      `INSERT INTO care_requests(patient_user_id,specialty,service_type,description) VALUES (1,'d','s','desc')`,
    );
    await expect(
      conn.query(`INSERT INTO appointments(care_request_id,patient_user_id,provider_id,appointment_type,starts_at,ends_at,created_by_user_id)
                  VALUES (1,1,1,'assessment','2030-01-01 10:00:00','2030-01-01 09:00:00',1)`),
    ).rejects.toThrow(/chk_appointments_time_order/);
  });
});
