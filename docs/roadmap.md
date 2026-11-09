# Roadmap — what's left to do

Status as of 2026-11-09. The foundation (API, web portals, migrations, tests, docs) is done; the core
journey works end to end: request → offers → patient chooses → appointment → assessment → treatment → done.

## Now — get the project running on your side

- [x] Put the repo under git and push to GitHub.
- [ ] Make CI run on `master`: change `branches: [main]` to `branches: [main, master]` in `.github/workflows/ci.yml`, then confirm it passes.
- [ ] Run `docker compose up --build` once (not yet verified on a machine with Docker) and walk the journey
      in [development.md](development.md#walk-through-the-whole-journey).
- [ ] Clinical governance: approve the emergency question and guidance wording/numbers
      (`apps/api/src/modules/requests/requests.service.ts`, `apps/web/src/features/patient/NewRequestPage.tsx`).

## Next — product features (in suggested order)

| # | Feature | Why | Notes |
|---|---|---|---|
| 1 | ✅ **Consent capture** (done 2026-11-09) | NDPA: record terms/privacy/data-sharing consent before a request is shared with providers | `user_consents` history, sign-up agreements, consent in the request form, privacy settings. Policy texts are placeholders until legal review |
| 2 | ✅ **Notifications** (done 2026-11-09) | Patients and clinics shouldn't have to refresh to see offers, bookings, reminders | In-app inbox + bell, worker with retries, 10 events. Termii SMS adapter + typed adapter interface for more providers (2026-11-09). Still to do: Termii account/sender ID, appointment reminders the day before |
| 3 | **Provider availability / slots** | The design's core promise is *real* capacity, not free-text times | New tables for opening hours and slots; booking picks a slot; keeps the per-provider lock |
| 4 | **Clinical referrals** | General dentist → specialist (e.g. endodontist) hand-off with acceptance and outcome | `clinical_referrals` table exists; clinical summary must stay out of logs |
| 5 | **Service estimates** | Cost transparency before treatment | `service_estimates` table exists |
| 6 | **Operator tools** | Spot stuck requests (SLA timers, e.g. no offer within 2 working hours), audit-log viewer | Pilot KPIs from the product design |
| 7 | **Matching score** | Rank providers by specialty, availability, verification, distance, cost, performance | Weights in the product design; verification + clinical fit stay mandatory filters |
| 8 | **Secure uploads** | Patients attach photos/X-rays | Encrypted object storage + signed URLs; never in MySQL |
| 9 | **Payments** | After commercial and regulatory review | `payments` table exists; Paystack/Flutterwave webhooks + reconciliation |
| 10 | **Installable web app (PWA)** | Most patients will be on phones; a PWA avoids separate native apps for now | Manifest + service worker on `apps/web`; native (Expo) only if needed later |

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
