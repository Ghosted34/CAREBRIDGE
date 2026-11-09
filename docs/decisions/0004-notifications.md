# 0004 — Notifications

- **Status:** accepted
- **Date:** 2026-11-09

## Context
Patients and clinics need to hear about offers, bookings and progress without refreshing pages. Messages
go over SMS and email, which are not private channels, and many users will rely on SMS.

## Decision
1. **Transactional outbox in MySQL** (`notifications` table): services insert notifications in the same
   transaction as the change. No message broker for the pilot.
2. **In-app first**: every event creates an in-app notification (delivered immediately, shown by the header
   bell). SMS for patient-critical events, email for clinic staff.
3. **A separate worker process** sends SMS/email using `FOR UPDATE SKIP LOCKED`, so several workers can run.
   Retries after 1, 2, 4, 8 minutes; `failed` after 5 attempts; `skipped` when there is nothing to send to.
4. **Pluggable drivers (adapter pattern)**: every provider is an adapter behind one `Driver` interface
   (`send({ to, subject, text })`), with its own setup (keys, sender ID) read from env; config picks which
   adapter runs (`NOTIFY_SMS_PROVIDER`, `NOTIFY_EMAIL_PROVIDER`). Today: `log`, `termii` (SMS), `smtp` (email), `none`.
   Types and the how-to: [notifications.md](../notifications.md#adding-a-provider-adapter-pattern).
   *Decided 2026-11-09:* support several providers rather than locking in one — e.g. Termii, Africa's
   Talking, Twilio, AWS End User Messaging (SMS) for SMS; SMTP or AWS SES for email. Each is one new adapter.
5. **No clinical text in any message**: payloads may hold only IDs, clinic names and times; forbidden keys are
   rejected in code; SMS wording is generic. Text is rendered from templates at send/read time.

## Consequences
- Worker sends while holding row locks; fine at pilot volume, revisit (a `sending` status) at scale.
- The same SMS driver will deliver one-time login codes when secure login is built.
- Reminders (e.g. the day before an appointment) need a scheduler; not built yet.
