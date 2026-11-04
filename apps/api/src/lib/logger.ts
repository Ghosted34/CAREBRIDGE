import { pino } from 'pino';
import { env } from '../config/env.js';

// Redact anything that could carry credentials or clinical content.
export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      '*.password',
      '*.password_hash',
      '*.description',
      '*.clinical_summary',
      'token',
    ],
    censor: '[REDACTED]',
  },
});
