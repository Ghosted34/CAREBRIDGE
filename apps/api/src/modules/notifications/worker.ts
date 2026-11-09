import { env } from '../../config/env.js';
import { withTransaction } from '../../db/pool.js';
import type { ConfiguredProviders } from './providers/registry.js';
import { ProviderError } from './providers/types.js';
import * as repo from './notifications.repo.js';
import { render, type Payload } from './templates.js';

export const MAX_ATTEMPTS = 5;
/** Minutes to wait before attempt n+1 (after n failures): 1, 2, 4, 8. */
export const backoffMinutes = (attemptsSoFar: number) => 2 ** attemptsSoFar;

export interface BatchResult {
  sent: number;
  retrying: number;
  failed: number;
  skipped: number;
}

/**
 * Send one batch of due SMS/email notifications. Rows are locked with SKIP LOCKED inside a
 * transaction, so several workers can run without double-sending. Network calls happen while the
 * rows are locked; fine at pilot volume (batch of 20). Revisit with a "sending" status at scale.
 */
export async function processBatch(
  providers: ConfiguredProviders,
  limit = 20,
): Promise<BatchResult> {
  const result: BatchResult = { sent: 0, retrying: 0, failed: 0, skipped: 0 };
  await withTransaction(async (tx) => {
    const rows = await repo.claimDue(tx, limit);
    for (const n of rows) {
      const channel = n.channel as 'sms' | 'email';
      const provider = providers[channel];
      const to = channel === 'sms' ? (n.phone as string | null) : (n.email as string | null);
      if (!provider) {
        await repo.markSkipped(tx, n.id, `${channel} channel is switched off`);
        result.skipped++;
        continue;
      }
      if (!to || n.user_status === 'suspended') {
        await repo.markSkipped(tx, n.id, !to ? `no ${channel} address on file` : 'user suspended');
        result.skipped++;
        continue;
      }
      const payload = (
        typeof n.payload === 'string' ? JSON.parse(n.payload) : n.payload
      ) as Payload;
      const msg = render(n.template_key, payload);
      const link = `${env.APP_URL}${msg.link}`;
      try {
        const sent = await provider.send({
          to,
          subject: msg.title,
          text:
            channel === 'sms'
              ? (msg.sms ?? `CareBridge: ${msg.title}. Open the app for details.`)
              : `${msg.body}\n\nOpen CareBridge: ${link}`,
        });
        await repo.markSent(tx, n.id, provider.name, sent.providerMessageId ?? null);
        result.sent++;
      } catch (err) {
        const attempts = Number(n.attempts) + 1;
        // Permanent errors (e.g. an invalid number) fail at once; others retry with backoff.
        const permanent = err instanceof ProviderError && !err.retryable;
        const retry = permanent || attempts >= MAX_ATTEMPTS ? null : backoffMinutes(attempts - 1);
        const message = err instanceof Error ? err.message : String(err);
        await repo.markAttemptFailed(tx, n.id, provider.name, message, retry);
        if (retry === null) result.failed++;
        else result.retrying++;
      }
    }
  });
  return result;
}
