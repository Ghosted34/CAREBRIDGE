import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().default('carebridge'),
  DB_USER: z.string().default('carebridge'),
  DB_PASSWORD: z.string(),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  // Notifications: which adapter sends each channel (see modules/notifications/providers/registry.ts).
  // Each provider validates its own settings (e.g. TERMII_API_KEY) when the worker starts.
  NOTIFY_SMS_PROVIDER: z.string().default('log'),
  NOTIFY_EMAIL_PROVIDER: z.string().default('log'),
  APP_URL: z.string().default('http://localhost:3000'), // used for links in emails
  WORKER_POLL_MS: z.coerce.number().int().min(500).default(5000),
  // When true, applies pending database migrations on server startup.
  // Required for single-container deployments (Docker, cPanel) where there
  // is no separate CLI step to run migrations before the API starts.
  AUTO_MIGRATE: z.coerce.boolean().default(false),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast with a readable message; never start with a half-configured environment.
  process.stderr.write(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}\n`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
