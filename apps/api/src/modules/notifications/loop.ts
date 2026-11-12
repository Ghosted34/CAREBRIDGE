import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import type { ConfiguredProviders } from './providers/registry.js';
import { processBatch } from './worker.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Keep sending queued SMS/email until `shouldStop()` returns true. Used by the standalone worker
 * (src/worker.ts) and, with RUN_WORKER_IN_PROCESS=true, inside the API process (single-process hosts
 * such as cPanel). Safe to run several at once: batches are claimed with SKIP LOCKED.
 */
export async function runNotificationLoop(
  providers: ConfiguredProviders,
  shouldStop: () => boolean,
): Promise<void> {
  logger.info(
    {
      sms: providers.sms?.name ?? 'off',
      email: providers.email?.name ?? 'off',
      pollMs: env.WORKER_POLL_MS,
    },
    'Notification worker started',
  );
  while (!shouldStop()) {
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
  logger.info('Notification worker stopped');
}
