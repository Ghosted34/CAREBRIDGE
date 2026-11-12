/** Notification worker: sends queued SMS/email. Run alongside the API: `npm run worker` / `node dist/worker.js`. */
import { pool } from './db/pool.js';
import { runNotificationLoop } from './modules/notifications/loop.js';
import {
  ProviderConfigError,
  providersFromEnv,
  type ConfiguredProviders,
} from './modules/notifications/providers/registry.js';

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
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => (stopping = true));
void runNotificationLoop(providers, () => stopping).finally(() => pool.end());
