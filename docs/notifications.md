# Notifications and providers

How CareBridge tells people about bookings, confirmations and visit notes, and how to plug in SMS/email providers.
Events and who receives them: [architecture.md → Notifications](architecture.md#notifications).

## How sending works

```
service (inside its transaction) ──notify()──▶ notifications table
                                                 │  in_app rows: delivered immediately (header bell)
                                                 │  sms / email rows: status = queued
worker (npm run worker) ──claims due rows──▶ provider adapter ──▶ Termii / SMTP / …
                         ◀── sent (+ provider message id) | retry 1, 2, 4, 8 min | failed | skipped
```

- A **permanent** error (e.g. invalid phone number) fails at once; anything else is retried up to 5 times.
- `skipped` = channel switched off, no address on file, or user suspended.
- Each sent row records `provider` and `provider_message_id` — quote the id when contacting the provider's support.

## Choosing providers

Set in `.env` (API/worker):

| Variable | Values | Default |
|---|---|---|
| `NOTIFY_SMS_PROVIDER` | `log`, `termii`, `none` | `log` |
| `NOTIFY_EMAIL_PROVIDER` | `log`, `smtp`, `none` | `log` |

`log` prints the message in the worker's output (development). `none` switches the channel off.
The worker refuses to start if the selected provider's settings are missing or wrong, and says which.

## Termii (SMS)

1. Create an account at termii.com and top up.
2. **Register a sender ID** (e.g. `CareBridge`, 3–11 letters/digits). Approval takes time — start early.
3. Ask Termii support to **enable the DND route** on your account. CareBridge sends on the `dnd` channel by
   default because Termii's `generic` route doesn't reach numbers on Do-Not-Disturb and doesn't deliver to MTN
   Nigeria between 8PM and 8AM WAT.
4. From the dashboard, copy your **API key** and your account's **base URL** (it differs per account).
5. Set:

   ```
   NOTIFY_SMS_PROVIDER=termii
   TERMII_API_KEY=TL...
   TERMII_BASE_URL=https://<your-account-base-url>
   TERMII_SENDER_ID=CareBridge
   # TERMII_CHANNEL=dnd     # or generic (not recommended for transactional messages or codes)
   ```

6. Restart the worker and check its log for `Notification worker started … sms: termii`.

Phone numbers are converted to Termii's format automatically (`0801…` and `+234 801…` → `234801…`).
Reference: [Termii Messaging API](https://developer.termii.com/messaging-api).

## SMTP (email)

```
NOTIFY_EMAIL_PROVIDER=smtp
SMTP_URL=smtps://user:password@smtp.example.com:465
EMAIL_FROM=CareBridge <no-reply@your-domain>
```

Works with any SMTP service, including AWS SES's SMTP endpoint. Set `APP_URL` so email links point at
your web app.

## Adding a provider (adapter pattern)

Every provider is an **adapter** implementing the same typed interface, so the worker, retries, templates
and (later) login codes never change when you add one. The types live in
`apps/api/src/modules/notifications/providers/types.ts`:

| Type | Meaning |
|---|---|
| `NotificationProvider<C>` | A ready adapter: `name`, `channel` (`'sms'` or `'email'`), `send(message) → { providerMessageId? }` |
| `ProviderDefinition<C, S>` | How to build one: `channel`, `description`, `config` (Zod schema of its env vars `S`), `create(config, deps)` |
| `ProviderError` | Throw on failure; `retryable: false` for errors retrying can't fix |
| `defineProvider(...)` | Helper that infers the settings type from the schema |

Steps (example: Africa's Talking SMS):

1. Create `providers/africastalking.ts`:

   ```ts
   import { z } from 'zod';
   import { defineProvider, ProviderError } from './types.js';

   export const africasTalking = defineProvider({
     channel: 'sms',
     description: "SMS via Africa's Talking",
     config: z.object({
       AT_USERNAME: z.string({ error: 'AT_USERNAME is required' }),
       AT_API_KEY: z.string({ error: 'AT_API_KEY is required' }),
       AT_SENDER_ID: z.string().optional(),
     }),
     create(config, { fetch }) {
       return {
         name: 'africastalking',
         channel: 'sms',
         async send(msg) {
           const res = await fetch('https://…', { method: 'POST', /* per their docs */ });
           if (!res.ok) throw new ProviderError(`Africa's Talking ${res.status}`, res.status >= 500 || res.status === 429, res.status);
           return { providerMessageId: /* id from their response */ undefined };
         },
       };
     },
   });
   ```

2. Register it in `providers/registry.ts`:

   ```ts
   export const SMS_PROVIDERS = { log: logSms, termii, africastalking: africasTalking } satisfies …;
   ```

   TypeScript checks that it's an SMS adapter; `NOTIFY_SMS_PROVIDER=africastalking` now selects it.

3. Test it with a faked `fetch` like `test/notificationProviders.test.ts` does for Termii: the exact request,
   success, retryable vs permanent errors, and that secrets never appear in error messages.
4. Add its env vars to `apps/api/.env.example`, this page and [deployment.md](deployment.md).

Rules for adapters: never log or throw the API key or the request body; keep `send` free of retries (the
worker does that); use `deps.fetch`, not the global, so tests can fake it; time out network calls.
