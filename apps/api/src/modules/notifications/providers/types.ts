/**
 * Notification provider adapters.
 *
 * Every SMS/email provider (Termii, SMTP, AWS SES, Africa's Talking, …) is an adapter that implements
 * `NotificationProvider`. Each declares its own settings (env vars) as a Zod schema in its
 * `ProviderDefinition`, so a misconfigured provider fails at start-up with a clear message.
 * The registry (registry.ts) lists the available adapters per channel; `NOTIFY_SMS_PROVIDER` /
 * `NOTIFY_EMAIL_PROVIDER` choose which one runs. To add a provider: docs/notifications.md.
 */
import type { z } from 'zod';

export type Channel = 'sms' | 'email';

export interface OutboundMessage {
  /** Phone number (any common format; adapters normalise) or email address. */
  to: string;
  /** Email subject; SMS adapters ignore it. */
  subject: string;
  /** Plain text body. Never contains clinical information (see templates.ts). */
  text: string;
}

export interface SendResult {
  /** The provider's id for the message, kept for delivery reports and support tickets. */
  providerMessageId?: string;
}

/** A configured, ready-to-use adapter for one channel. */
export interface NotificationProvider<C extends Channel = Channel> {
  /** Registry key, e.g. 'termii'. Stored on each sent notification. */
  readonly name: string;
  readonly channel: C;
  /** Deliver one message. Throw `ProviderError` (or any error) on failure. */
  send(message: OutboundMessage): Promise<SendResult>;
}

/** Things an adapter may need from outside, injectable for tests. */
export interface ProviderDeps {
  fetch: typeof fetch;
}

/**
 * How to build an adapter: its settings schema and a factory. `S` is the Zod schema of its env vars,
 * so `create` receives the parsed, typed settings.
 */
export interface ProviderDefinition<C extends Channel, S extends z.ZodType = z.ZodType> {
  channel: C;
  /** One line shown in docs/errors. */
  description: string;
  /** Validates and parses this provider's env vars (e.g. TERMII_API_KEY). */
  config: S;
  // Method syntax on purpose: lets a registry hold definitions with different settings types.
  create(config: z.infer<S>, deps: ProviderDeps): NotificationProvider<C>;
}

/**
 * Error thrown by adapters. `retryable: false` means trying again can't help (e.g. an invalid phone
 * number), so the worker marks the notification failed at once instead of retrying.
 */
export class ProviderError extends Error {
  override name = 'ProviderError';
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
  }
}

/** Identity helper so TypeScript infers the settings type from the schema. */
export function defineProvider<C extends Channel, S extends z.ZodType>(
  def: ProviderDefinition<C, S>,
): ProviderDefinition<C, S> {
  return def;
}
