/**
 * CareBridge migration engine.
 *
 * Files live in `src/db/migrations/` and are named `YYYYMMDDHHmm_snake_case_name.sql`.
 * Each file has two sections:
 *
 *   -- migrate:up
 *   CREATE TABLE ...;
 *
 *   -- migrate:down
 *   DROP TABLE ...;
 *
 * Safety rules enforced here:
 *  - an applied migration must not change (SHA-256 checksum of its up section is stored);
 *  - an applied migration must not disappear;
 *  - a pending migration older than the newest applied one is refused (out of order) unless allowed;
 *  - only one runner at a time (MySQL named lock);
 *  - each migration is recorded only after all its statements succeed, and a failure reports exactly
 *    which statement failed, because MySQL DDL auto-commits and cannot be rolled back.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Connection, RowDataPacket } from 'mysql2/promise';

export const FILE_PATTERN = /^(\d{12})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
const LOCK_NAME = 'carebridge_migrations';
const TABLE = 'schema_migrations';

export class MigrationError extends Error {
  override name = 'MigrationError';
}

export interface Migration {
  version: string;
  name: string;
  file: string;
  up: string[];
  down: string[];
  checksum: string;
}

export interface AppliedMigration {
  version: string;
  name: string;
  checksum: string;
  applied_at: Date;
  execution_ms: number;
}

export interface MigrationStatus {
  applied: AppliedMigration[];
  pending: Migration[];
  problems: string[];
}

/** Split a SQL section into statements: drop `--` comment lines, split on `;` at end of line. */
export function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse one migration file's text. Throws MigrationError on any format problem. */
export function parseMigration(file: string, text: string): Migration {
  const match = FILE_PATTERN.exec(file);
  if (!match) {
    throw new MigrationError(
      `${file}: name must look like YYYYMMDDHHmm_snake_case_name.sql (e.g. 202611041200_add_x_to_y.sql)`,
    );
  }
  const normalised = text.replace(/\r\n/g, '\n'); // Windows checkouts must not change checksums
  const upAt = normalised.search(/^--\s*migrate:up\s*$/m);
  const downAt = normalised.search(/^--\s*migrate:down\s*$/m);
  if (upAt === -1 || downAt === -1 || downAt < upAt) {
    throw new MigrationError(
      `${file}: needs a '-- migrate:up' section followed by '-- migrate:down'`,
    );
  }
  const upSql = normalised.slice(upAt, downAt).replace(/^--\s*migrate:up\s*$/m, '');
  const downSql = normalised.slice(downAt).replace(/^--\s*migrate:down\s*$/m, '');
  const up = splitStatements(upSql);
  if (up.length === 0) throw new MigrationError(`${file}: the up section is empty`);
  return {
    version: match[1]!,
    name: match[2]!,
    file,
    up,
    down: splitStatements(downSql),
    checksum: createHash('sha256').update(up.join(';\n')).digest('hex'),
  };
}

/** Read, parse and validate every migration in `dir`, sorted by version. */
export async function loadMigrations(dir: string): Promise<Migration[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const migrations: Migration[] = [];
  const seen = new Map<string, string>();
  for (const file of files) {
    const m = parseMigration(file, await readFile(path.join(dir, file), 'utf8'));
    const clash = seen.get(m.version);
    if (clash) throw new MigrationError(`Duplicate version ${m.version}: ${clash} and ${file}`);
    seen.set(m.version, file);
    migrations.push(m);
  }
  return migrations;
}

export interface MigratorOptions {
  dir: string;
  log?: (message: string) => void;
  /** Allow applying a pending migration older than the newest applied one. Default false. */
  allowOutOfOrder?: boolean;
}

export class Migrator {
  private readonly log: (message: string) => void;

  constructor(
    private readonly conn: Connection,
    private readonly opts: MigratorOptions,
  ) {
    this.log = opts.log ?? (() => {});
  }

  private async ensureTable() {
    const [legacy] = await this.conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'version'`,
      [TABLE],
    );
    const [hasChecksum] = await this.conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'checksum'`,
      [TABLE],
    );
    if (legacy[0]!.n > 0 && hasChecksum[0]!.n === 0) {
      throw new MigrationError(
        `This database was migrated by the old migration runner (pre-2026-11-04 layout). ` +
          `It only ever held development data: drop and recreate the database, then run migrations again.`,
      );
    }
    await this.conn.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (
      version VARCHAR(12) NOT NULL PRIMARY KEY,
      name VARCHAR(190) NOT NULL,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      execution_ms INT UNSIGNED NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const [rows] = await this.conn.query<RowDataPacket[]>('SELECT GET_LOCK(?, 10) AS ok', [
      LOCK_NAME,
    ]);
    if (rows[0]!.ok !== 1) {
      throw new MigrationError('Another migration run holds the lock; try again when it finishes');
    }
    try {
      return await fn();
    } finally {
      await this.conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
    }
  }

  private async applied(): Promise<AppliedMigration[]> {
    const [rows] = await this.conn.query<RowDataPacket[]>(
      `SELECT version, name, checksum, applied_at, execution_ms FROM ${TABLE} ORDER BY version`,
    );
    return rows as AppliedMigration[];
  }

  /** Compare files with what the database has applied, without changing anything. */
  async status(): Promise<MigrationStatus> {
    await this.ensureTable();
    const files = await loadMigrations(this.opts.dir);
    const applied = await this.applied();
    const byVersion = new Map(files.map((m) => [m.version, m]));
    const appliedVersions = new Set(applied.map((a) => a.version));
    const problems: string[] = [];

    for (const a of applied) {
      const file = byVersion.get(a.version);
      if (!file) {
        problems.push(`${a.version}_${a.name}.sql was applied but the file is missing`);
      } else if (file.checksum !== a.checksum) {
        problems.push(
          `${file.file} was changed after it was applied. Never edit an applied migration: ` +
            `revert the edit and add a new migration instead.`,
        );
      }
    }
    const pending = files.filter((m) => !appliedVersions.has(m.version));
    const newest = applied.at(-1)?.version;
    if (newest && !this.opts.allowOutOfOrder) {
      for (const m of pending) {
        if (m.version < newest) {
          problems.push(
            `${m.file} is older than the newest applied migration (${newest}). ` +
              `Rename it with a newer timestamp (e.g. after a rebase), or run with --allow-out-of-order.`,
          );
        }
      }
    }
    return { applied, pending, problems };
  }

  /** Apply every pending migration in order. Returns the files applied. */
  async up(): Promise<string[]> {
    return this.withLock(async () => {
      const { pending, problems } = await this.status();
      if (problems.length)
        throw new MigrationError(`Refusing to migrate:\n  - ${problems.join('\n  - ')}`);
      const done: string[] = [];
      for (const m of pending) {
        const started = Date.now();
        await this.run(m, 'up');
        await this.conn.query(
          `INSERT INTO ${TABLE}(version, name, checksum, execution_ms) VALUES (?, ?, ?, ?)`,
          [m.version, m.name, m.checksum, Date.now() - started],
        );
        this.log(`applied  ${m.file} (${Date.now() - started} ms)`);
        done.push(m.file);
      }
      return done;
    });
  }

  /** Roll back the newest `steps` applied migrations, newest first. Returns the files rolled back. */
  async down(steps = 1): Promise<string[]> {
    if (!Number.isInteger(steps) || steps < 1)
      throw new MigrationError('steps must be a positive integer');
    return this.withLock(async () => {
      const { applied, problems } = await this.status();
      if (problems.length)
        throw new MigrationError(`Refusing to roll back:\n  - ${problems.join('\n  - ')}`);
      const files = new Map((await loadMigrations(this.opts.dir)).map((m) => [m.version, m]));
      const targets = applied.slice(-steps).reverse();
      const done: string[] = [];
      for (const a of targets) {
        const m = files.get(a.version)!;
        if (m.down.length === 0) {
          throw new MigrationError(`${m.file} has an empty down section and cannot be rolled back`);
        }
        await this.run(m, 'down');
        await this.conn.query(`DELETE FROM ${TABLE} WHERE version = ?`, [m.version]);
        this.log(`reverted ${m.file}`);
        done.push(m.file);
      }
      return done;
    });
  }

  private async run(m: Migration, direction: 'up' | 'down') {
    const statements = m[direction];
    for (const [i, stmt] of statements.entries()) {
      try {
        await this.conn.query(stmt);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        const partial =
          i > 0
            ? ` Statements 1-${i} of ${statements.length} already ran and MySQL DDL cannot be rolled back: ` +
              `inspect the schema and fix it by hand before retrying.`
            : ' Nothing from this migration was applied.';
        throw new MigrationError(
          `${m.file} (${direction}) failed at statement ${i + 1}/${statements.length}: ${reason}.${partial}`,
        );
      }
    }
  }
}
