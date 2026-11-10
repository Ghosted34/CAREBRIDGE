import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { logger } from './lib/logger.js';
import { MIGRATIONS_DIR } from './db/migrate.js';
import { Migrator } from './db/migrator.js';
import mysql from 'mysql2/promise';

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
    if (applied.length) {
      logger.info({ count: applied.length, versions: applied }, 'auto-migrate applied pending migrations');
    } else {
      logger.info('auto-migrate: database already up to date');
    }
  } finally {
    await conn.end();
  }
}

const server = createApp().listen(env.PORT, async () => {
  await autoMigrate();
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'CareBridge API listening');
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
