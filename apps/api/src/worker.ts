/** Notification worker: sends queued SMS/email. Run alongside the API: `npm run worker` / `node dist/worker.js`. */
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { logger } from './lib/logger.js';
import {
  ProviderConfigError,
  providersFromEnv,
  type ConfiguredProviders,
} from './modules/notifications/providers/registry.js';
import { processBatch } from './modules/notifications/worker.js';

// Fail fast with a readable message if the selected provider's settings are missing or wrong.
let providers: ConfiguredProviders;
try {
  providers = providersFromEnv();
} catch (err) {
  if (err instanceof ProviderConfigError) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
  throw err;
}
let stopping = false;

async function loop() {
  logger.info(
    {
      sms: providers.sms?.name ?? 'off',
      email: providers.email?.name ?? 'off',
      pollMs: env.WORKER_POLL_MS,
    },
    'Notification worker started',
  );
  while (!stopping) {
    try {
      const r = await processBatch(providers);
      if (r.sent || r.retrying || r.failed || r.skipped) logger.info(r, 'notification batch');
      // Keep going straight away while there's a backlog; otherwise wait.
      if (r.sent + r.retrying + r.failed + r.skipped === 0) await sleep(env.WORKER_POLL_MS);
    } catch (err) {
      logger.error({ err }, 'notification batch failed');
      await sleep(env.WORKER_POLL_MS);
    }
  }
  await pool.end();
  logger.info('Notification worker stopped');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => (stopping = true));
void loop();
