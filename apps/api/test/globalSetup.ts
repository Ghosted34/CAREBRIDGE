import 'dotenv/config'; // use DB credentials from apps/api/.env when present
import mysql from 'mysql2/promise';
import { MIGRATIONS_DIR } from '../src/db/migrate.js';
import { Migrator } from '../src/db/migrator.js';

export const adminConnection = () =>
  mysql.createConnection({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'carebridge',
    password: process.env.DB_PASSWORD ?? 'test-pass',
  });

/** Recreate the test database from migrations once per test run. */
export default async function setup() {
  const dbName = process.env.TEST_DB_NAME ?? 'carebridge_test';
  if (!/^[a-z0-9_]+_test$/.test(dbName))
    throw new Error(`Refusing to use non-test database "${dbName}"`);
  const conn = await adminConnection();
  await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await conn.query(
    `CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
  );
  await conn.changeUser({ database: dbName });
  await new Migrator(conn, { dir: MIGRATIONS_DIR }).up();
  await conn.end();
}
