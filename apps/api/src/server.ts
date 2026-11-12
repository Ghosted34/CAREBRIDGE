import mysql from 'mysql2/promise';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { MIGRATIONS_DIR } from './db/migrate.js';
import { Migrator } from './db/migrator.js';
import { pool } from './db/pool.js';
import { logger } from './lib/logger.js';
import { runNotificationLoop } from './modules/notifications/loop.js';
import {
  ProviderConfigError,
  providersFromEnv,
} from './modules/notifications/providers/registry.js';

/** Apply pending migrations (AUTO_MIGRATE=true) BEFORE accepting requests. */
async function autoMigrate() {
  if (!env.AUTO_MIGRATE) return;
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    timezone: 'Z',
  });
  await conn.query("SET time_zone = '+00:00'");
  try {
    const migrator = new Migrator(conn, {
      dir: MIGRATIONS_DIR,
      log: (m) => logger.info({ migration: m }, 'auto-migrate'),
    });
    const applied = await migrator.up();
    logger.info(
      applied.length ? { count: applied.length, versions: applied } : {},
      applied.length
        ? 'auto-migrate applied pending migrations'
        : 'auto-migrate: database up to date',
    );
  } finally {
    await conn.end();
  }
}

let stopping = false;

async function main() {
  // A failed migration must stop start-up: serving requests against a half-migrated schema is worse.
  await autoMigrate();

  const server = createApp().listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'CareLynk API listening');
  });

  // Single-process hosts (cPanel): send queued SMS/email from this process too.
  let workerDone: Promise<void> = Promise.resolve();
  if (env.RUN_WORKER_IN_PROCESS) {
    workerDone = runNotificationLoop(providersFromEnv(), () => stopping);
  }

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    stopping = true;
    server.close(() => {
      workerDone.finally(() => pool.end().finally(() => process.exit(0)));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  if (err instanceof ProviderConfigError) process.stderr.write(`${err.message}\n`);
  else logger.fatal({ err }, 'Start-up failed');
  process.exit(1);
});
