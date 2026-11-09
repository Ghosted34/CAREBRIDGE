/**
 * The available adapters per channel. Add new providers here — the key is the value of
 * NOTIFY_SMS_PROVIDER / NOTIFY_EMAIL_PROVIDER. 'none' (no adapter) switches the channel off.
 */
import { z } from 'zod';
import { logEmail, logSms } from './log.js';
import { smtp } from './smtp.js';
import { termii } from './termii.js';
import type { Channel, NotificationProvider, ProviderDefinition, ProviderDeps } from './types.js';

export const SMS_PROVIDERS = {
  log: logSms,
  termii,
} satisfies Record<string, ProviderDefinition<'sms'>>;

export const EMAIL_PROVIDERS = {
  log: logEmail,
  smtp,
} satisfies Record<string, ProviderDefinition<'email'>>;

export type SmsProviderName = keyof typeof SMS_PROVIDERS;
export type EmailProviderName = keyof typeof EMAIL_PROVIDERS;

export interface ConfiguredProviders {
  sms: NotificationProvider<'sms'> | null;
  email: NotificationProvider<'email'> | null;
}

export class ProviderConfigError extends Error {
  override name = 'ProviderConfigError';
}

function build<C extends Channel>(
  channel: C,
  registry: Record<string, ProviderDefinition<C>>,
  selected: string,
  env: Record<string, string | undefined>,
  deps: ProviderDeps,
): NotificationProvider<C> | null {
  if (selected === 'none') return null;
  const def = registry[selected];
  if (!def) {
    const options = [...Object.keys(registry), 'none'].join(', ');
    throw new ProviderConfigError(
      `Unknown ${channel} provider "${selected}". Choose one of: ${options}`,
    );
  }
  const parsed = def.config.safeParse(env);
  if (!parsed.success) {
    throw new ProviderConfigError(
      `${channel} provider "${selected}" is misconfigured:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return def.create(parsed.data, deps);
}

/** Build the selected adapters from env; throws ProviderConfigError with a readable message. */
export function providersFromEnv(
  env: Record<string, string | undefined> = process.env,
  deps: ProviderDeps = { fetch: globalThis.fetch },
): ConfiguredProviders {
  return {
    sms: build('sms', SMS_PROVIDERS, env.NOTIFY_SMS_PROVIDER ?? 'log', env, deps),
    email: build('email', EMAIL_PROVIDERS, env.NOTIFY_EMAIL_PROVIDER ?? 'log', env, deps),
  };
}
