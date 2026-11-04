// Runs before each test file's imports so config/env.ts sees test settings.
// Load apps/api/.env first so local DB credentials are used; defaults below only fill gaps.
import 'dotenv/config';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-secret-that-is-at-least-32-characters-long';
process.env.DB_HOST ??= '127.0.0.1';
process.env.DB_PORT ??= '3306';
process.env.DB_USER ??= 'carebridge';
process.env.DB_PASSWORD ??= 'test-pass';
process.env.BCRYPT_ROUNDS ??= '4';
// Always a dedicated database: the tests truncate every table.
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'carebridge_test';
