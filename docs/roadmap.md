# Roadmap — what's left to do

Status as of 2026-11-04. The foundation (API, web portals, migrations, tests, docs) is done; the core
journey works end to end: request → offers → patient chooses → appointment → assessment → treatment → done.

## Now — get the project running on your side

- [ ] Put the repo under git, push to GitHub, confirm the CI workflow passes (`.github/workflows/ci.yml`).
- [ ] Run `docker compose up --build` once (not yet verified on a machine with Docker) and walk the journey
      in [development.md](development.md#walk-through-the-whole-journey).
- [ ] Clinical governance: approve the emergency question and guidance wording/numbers
      (`apps/api/src/modules/requests/requests.service.ts`, `apps/web/src/features/patient/NewRequestPage.tsx`).

## Next — product features (in suggested order)

| # | Feature | Why | Notes |
|---|---|---|---|
| 1 | **Consent capture** | NDPA: record terms/privacy/data-sharing consent before a request is shared with providers | `patient_consents` table exists; need endpoints, sign-up checkbox, versioned policy text |
| 2 | **Notifications** (SMS / WhatsApp / email) | Patients and clinics shouldn't have to refresh to see offers, bookings, reminders | `notifications` table exists; add a worker + an approved Nigerian SMS/WhatsApp provider |
| 3 | **Provider availability / slots** | The design's core promise is *real* capacity, not free-text times | New tables for opening hours and slots; booking picks a slot; keeps the per-provider lock |
| 4 | **Clinical referrals** | General dentist → specialist (e.g. endodontist) hand-off with acceptance and outcome | `clinical_referrals` table exists; clinical summary must stay out of logs |
| 5 | **Service estimates** | Cost transparency before treatment | `service_estimates` table exists |
| 6 | **Operator tools** | Spot stuck requests (SLA timers, e.g. no offer within 2 working hours), audit-log viewer | Pilot KPIs from the product design |
| 7 | **Matching score** | Rank providers by specialty, availability, verification, distance, cost, performance | Weights in the product design; verification + clinical fit stay mandatory filters |
| 8 | **Secure uploads** | Patients attach photos/X-rays | Encrypted object storage + signed URLs; never in MySQL |
| 9 | **Payments** | After commercial and regulatory review | `payments` table exists; Paystack/Flutterwave webhooks + reconciliation |
| 10 | **Mobile app** (Expo) | Most patients will be on phones | Reuses `/api/v1`; consider generating shared types from an OpenAPI spec first |

## Before real patient data (launch blockers)

From [security.md](security.md#before-launch) and [deployment.md](deployment.md#launch-checklist-before-real-patient-data):

- [ ] OTP/MFA for staff, operators and admins; phone/email verification for patients; password reset.
- [ ] Sessions in httpOnly cookies + refresh tokens (instead of `sessionStorage`).
- [ ] Shared rate-limit store (Redis) if running more than one API instance.
- [ ] TLS, backups with tested restores, monitoring/alerting, log retention.
- [ ] Encryption at rest; data retention/deletion policy; data-subject request process.
- [ ] Penetration test; dependency scanning in CI.
- [ ] NDPA 2023 legal review, provider data-processing agreements, incident response plan.

## Engineering improvements

- [ ] OpenAPI spec for `/api/v1` and generated web types (replaces hand-written `src/api/types.ts`).
- [ ] Browser end-to-end tests (Playwright) in CI — the journey was verified manually with a script.
- [ ] Clear the moderate `minimatch` advisories in dev-only lint tooling when upstream releases land
      (runtime dependencies currently report 0 vulnerabilities).
