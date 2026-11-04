import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { env } from '../config/env.js';

export const pool: Pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z',
  decimalNumbers: true,
  dateStrings: false,
  // MySQL BOOLEAN is TINYINT(1); return real booleans to API clients.
  typeCast(field, next) {
    if (field.type === 'TINY' && field.length === 1) {
      const v = field.string();
      return v === null ? null : v === '1';
    }
    return next();
  },
});

// All times are stored and compared in UTC; convert to Africa/Lagos only in clients.
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});

/** Anything that can run a query: the pool or a transaction connection. */
export type Db = Pool | PoolConnection;
export type Row = RowDataPacket;
export type Result = ResultSetHeader;

/** Run `fn` inside a transaction; commits on success, rolls back on any throw. */
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
