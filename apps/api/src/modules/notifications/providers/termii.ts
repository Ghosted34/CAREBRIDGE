/**
 * Termii SMS adapter — https://developer.termii.com/messaging-api ("Send a Single SMS").
 *
 *   POST {TERMII_BASE_URL}/api/sms/send
 *   { api_key, to: "2348012345678", from: <sender ID>, sms, type: "plain", channel: "dnd" | "generic" }
 *   200 → { code: "ok", message_id, message: "Successfully Sent", balance, user }
 *
 * Notes from Termii's docs:
 *  - The base URL is specific to each account (shown on the Termii dashboard).
 *  - `generic` doesn't reach numbers on DND, and doesn't deliver to MTN Nigeria 8PM–8AM WAT; `dnd` reaches
 *    everyone and is recommended for transactional messages and OTPs, but must be enabled by Termii support.
 *  - Sender IDs are 3–11 characters and must be registered/approved before use.
 */
import { z } from 'zod';
import { defineProvider, ProviderError } from './types.js';

const TIMEOUT_MS = 10_000;

/** Termii wants international format without '+': 2348012345678. Local Nigerian 0801… → 234801…. */
export function toTermiiNumber(input: string): string {
  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (/^0\d{10}$/.test(digits)) digits = `234${digits.slice(1)}`;
  if (!/^\d{8,15}$/.test(digits)) {
    throw new ProviderError(`Not a valid international phone number: ${input.slice(0, 4)}…`, false);
  }
  return digits;
}

export const termii = defineProvider({
  channel: 'sms',
  description: 'SMS via Termii (Nigeria and other African markets)',
  config: z.object({
    TERMII_API_KEY: z
      .string({ error: 'TERMII_API_KEY is required (Termii dashboard → API settings)' })
      .min(10, 'TERMII_API_KEY looks too short'),
    TERMII_BASE_URL: z
      .url({
        error:
          'TERMII_BASE_URL is required: your account base URL from the Termii dashboard, e.g. https://v3.api.termii.com',
      })
      .transform((u) => u.replace(/\/+$/, '')),
    TERMII_SENDER_ID: z
      .string({ error: 'TERMII_SENDER_ID is required: your approved sender ID, e.g. OnDiGoH' })
      .regex(
        /^[A-Za-z0-9 ]{3,11}$/,
        'TERMII_SENDER_ID must be 3–11 letters/digits and approved by Termii',
      ),
    TERMII_CHANNEL: z.enum(['dnd', 'generic']).default('dnd'),
  }),
  create(config, { fetch }) {
    return {
      name: 'termii',
      channel: 'sms',
      async send(msg) {
        const body = {
          api_key: config.TERMII_API_KEY,
          to: toTermiiNumber(msg.to),
          from: config.TERMII_SENDER_ID,
          sms: msg.text,
          type: 'plain',
          channel: config.TERMII_CHANNEL,
        };
        let res: Response;
        try {
          res = await fetch(`${config.TERMII_BASE_URL}/api/sms/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
        } catch (err) {
          // Network failure or timeout: worth retrying.
          throw new ProviderError(
            `Termii unreachable: ${err instanceof Error ? err.message : String(err)}`,
            true,
          );
        }
        const json = (await res.json().catch(() => null)) as {
          code?: string;
          message?: string;
          message_id?: string;
          message_id_str?: string;
        } | null;
        if (res.ok && json?.code === 'ok') {
          return { providerMessageId: json.message_id_str ?? json.message_id };
        }
        // Never include the request (it holds the API key) in the error.
        const reason = `Termii ${res.status}: ${json?.message ?? 'unexpected response'}`;
        throw new ProviderError(reason, isRetryable(res.status), res.status);
      },
    };
  },
});

/**
 * Retry server errors, rate limits and auth/config errors (an operator can fix a key or top up within the
 * retry window). Don't retry other 4xx, e.g. an invalid number or rejected content.
 */
function isRetryable(status: number) {
  return (
    status >= 500 ||
    status === 429 ||
    status === 401 ||
    status === 403 ||
    status === 402 ||
    status === 200
  );
}
