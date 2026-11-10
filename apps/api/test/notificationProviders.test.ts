import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool, type Row } from '../src/db/pool.js';
import {
  EMAIL_PROVIDERS,
  ProviderConfigError,
  providersFromEnv,
  SMS_PROVIDERS,
} from '../src/modules/notifications/providers/registry.js';
import { termii, toTermiiNumber } from '../src/modules/notifications/providers/termii.js';
import { ProviderError } from '../src/modules/notifications/providers/types.js';
import { processBatch } from '../src/modules/notifications/worker.js';
import { acceptedRequest, resetDb } from './helpers.js';

const TERMII_ENV = {
  TERMII_API_KEY: 'TLtestkey1234567890',
  TERMII_BASE_URL: 'https://v3.api.termii.com/',
  TERMII_SENDER_ID: 'CareBridge',
};

function fakeFetch(status: number, body: unknown) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}

function makeTermii(fetchFn: typeof fetch, env: Record<string, string> = TERMII_ENV) {
  return termii.create(termii.config.parse(env), { fetch: fetchFn });
}

describe('Termii adapter', () => {
  it('posts the documented request to {base}/api/sms/send and returns the message id', async () => {
    const fetchFn = fakeFetch(200, {
      code: 'ok',
      balance: 1047.57,
      message_id: '3017544054459083819856413',
      message: 'Successfully Sent',
      user: 'Test',
      message_id_str: '3017544054459083819856413',
    });
    const sms = makeTermii(fetchFn as unknown as typeof fetch);
    const r = await sms.send({
      to: '+234 801 234 5678',
      subject: 'ignored',
      text: 'CareLynk: hello',
    });
    expect(r).toEqual({ providerMessageId: '3017544054459083819856413' });

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://v3.api.termii.com/api/sms/send'); // trailing slash in base URL handled
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      api_key: 'TLtestkey1234567890',
      to: '2348012345678',
      from: 'CareBridge',
      sms: 'CareLynk: hello',
      type: 'plain',
      channel: 'dnd', // transactional route by default
    });
  });

  it('normalises Nigerian and international numbers to Termii format', () => {
    expect(toTermiiNumber('08012345678')).toBe('2348012345678');
    expect(toTermiiNumber('+234 801-234-5678')).toBe('2348012345678');
    expect(toTermiiNumber('002348012345678')).toBe('2348012345678');
    expect(() => toTermiiNumber('call me')).toThrow(ProviderError);
  });

  it('an invalid number fails permanently without calling Termii', async () => {
    const fetchFn = fakeFetch(200, { code: 'ok' });
    const err = await makeTermii(fetchFn as unknown as typeof fetch)
      .send({ to: 'abc', subject: '', text: 'x' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    [500, true],
    [503, true],
    [429, true],
    [401, true], // bad key: an operator can fix it within the retry window
    [400, false], // rejected request: retrying won't help
    [404, false],
  ])(
    'HTTP %i → retryable %s, and the API key never appears in the error',
    async (status, retryable) => {
      const sms = makeTermii(
        fakeFetch(status, { message: 'Something went wrong' }) as unknown as typeof fetch,
      );
      const err = (await sms
        .send({ to: '08012345678', subject: '', text: 'x' })
        .catch((e: unknown) => e)) as ProviderError;
      expect(err).toBeInstanceOf(ProviderError);
      expect(err.retryable).toBe(retryable);
      expect(err.status).toBe(status);
      expect(err.message).toContain(`Termii ${status}`);
      expect(err.message).not.toContain('TLtestkey');
    },
  );

  it('a 200 without code "ok" is treated as a (retryable) failure', async () => {
    const sms = makeTermii(
      fakeFetch(200, { message: 'Insufficient balance' }) as unknown as typeof fetch,
    );
    await expect(sms.send({ to: '08012345678', subject: '', text: 'x' })).rejects.toMatchObject({
      retryable: true,
    });
  });

  it('network errors and timeouts are retryable', async () => {
    const sms = makeTermii(
      vi.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch,
    );
    await expect(sms.send({ to: '08012345678', subject: '', text: 'x' })).rejects.toMatchObject({
      retryable: true,
      message: expect.stringContaining('Termii unreachable'),
    });
  });

  it('validates its own settings', () => {
    expect(termii.config.safeParse({ ...TERMII_ENV, TERMII_API_KEY: '' }).success).toBe(false);
    expect(
      termii.config.safeParse({ ...TERMII_ENV, TERMII_SENDER_ID: 'CareBridgeNigeria' }).success,
    ).toBe(false); // > 11
    expect(termii.config.safeParse({ ...TERMII_ENV, TERMII_BASE_URL: 'not a url' }).success).toBe(
      false,
    );
    expect(termii.config.parse({ ...TERMII_ENV, TERMII_CHANNEL: 'generic' }).TERMII_CHANNEL).toBe(
      'generic',
    );
  });
});

describe('provider registry', () => {
  it('defaults to the log adapter for both channels', () => {
    const p = providersFromEnv({});
    expect([p.sms?.name, p.email?.name]).toEqual(['log', 'log']);
  });

  it('"none" switches a channel off', () => {
    expect(
      providersFromEnv({ NOTIFY_SMS_PROVIDER: 'none', NOTIFY_EMAIL_PROVIDER: 'none' }),
    ).toEqual({ sms: null, email: null });
  });

  it('builds Termii when selected and configured', () => {
    const p = providersFromEnv({ NOTIFY_SMS_PROVIDER: 'termii', ...TERMII_ENV });
    expect(p.sms).toMatchObject({ name: 'termii', channel: 'sms' });
  });

  it('explains a missing setting for the selected provider', () => {
    expect(() => providersFromEnv({ NOTIFY_SMS_PROVIDER: 'termii' })).toThrow(ProviderConfigError);
    expect(() => providersFromEnv({ NOTIFY_SMS_PROVIDER: 'termii' })).toThrow(/TERMII_API_KEY/);
    expect(() => providersFromEnv({ NOTIFY_EMAIL_PROVIDER: 'smtp' })).toThrow(/SMTP_URL/);
  });

  it('lists the options for an unknown provider', () => {
    expect(() => providersFromEnv({ NOTIFY_SMS_PROVIDER: 'carrier-pigeon' })).toThrow(
      /log, termii, none/,
    );
  });

  it('every registered adapter belongs to the channel it is registered under', () => {
    for (const def of Object.values(SMS_PROVIDERS)) expect(def.channel).toBe('sms');
    for (const def of Object.values(EMAIL_PROVIDERS)) expect(def.channel).toBe('email');
  });
});

describe('worker + Termii end to end (HTTP faked)', () => {
  beforeEach(resetDb);
  afterAll(() => pool.end());

  it('sends the queued SMS through Termii and stores its message id', async () => {
    await acceptedRequest();
    const fetchFn = fakeFetch(200, {
      code: 'ok',
      message_id: '42',
      message_id_str: '42',
      message: 'Successfully Sent',
    });
    const r = await processBatch({
      sms: makeTermii(fetchFn as unknown as typeof fetch),
      email: null,
    });
    expect(r.sent).toBe(1);
    const [rows] = await pool.query<Row[]>(
      "SELECT status, provider, provider_message_id FROM notifications WHERE channel = 'sms'",
    );
    expect(rows[0]).toEqual({ status: 'sent', provider: 'termii', provider_message_id: '42' });
    const body = JSON.parse(
      String((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(body.sms).toMatch(/^CareLynk: a verified provider has responded to your request #\d+/);
  });
});
