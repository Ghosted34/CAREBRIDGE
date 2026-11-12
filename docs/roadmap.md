# Roadmap — what's left to do

Status as of 2026-11-11. The MVP flow works end to end and was walked through on a clean database:
problem + free periods → clinics near you with open times → book → clinic confirms → check-in → notes
(prescription, referral, follow-up, close). See [ADR 0005](decisions/0005-mvp-realignment.md).

## Now — get the project running on your side

- [x] Put the repo under git and push to GitHub.
- [ ] Make CI run on `master`: change `branches: [main]` to `branches: [main, master]` in `.github/workflows/ci.yml`, then confirm it passes.
- [ ] Run `docker compose up --build` once (not yet verified on a machine with Docker) and walk the journey
      in [development.md](development.md#walk-through-the-whole-journey).
- [ ] Clinical governance: approve the emergency question and guidance wording/numbers
      (`apps/api/src/modules/requests/emergency.ts`, `apps/web/src/features/patient/BookPage.tsx`).

## Next — product features (in suggested order)

| # | Feature | Why | Notes |
|---|---|---|---|
| 1 | ✅ **Consent capture** (done 2026-11-09) | NDPA: record terms/privacy/data-sharing consent before a request is shared with providers | `user_consents` history, sign-up agreements, consent in the request form, privacy settings. Policy texts are placeholders until legal review |
| 2 | ✅ **Notifications** (done 2026-11-09) | Patients and clinics shouldn't have to refresh to see offers, bookings, reminders | In-app inbox + bell, worker with retries, 10 events. Termii SMS adapter + typed adapter interface for more providers (2026-11-09). Still to do: Termii account/sender ID, appointment reminders the day before |
| 3 | ✅ **Real availability** (reworked 2026-11-11) | The design's core promise is *real* capacity, not free-text times | Free times computed from each centre's opening hours minus bookings; one appointment per centre at a time; booking re-checked under a lock |
| 4 | ✅ **Clinical referrals** (done 2026-11-09) | General dentist → specialist (e.g. endodontist) hand-off with acceptance and outcome | `clinical_referrals` lifecycle (sent → accepted/declined → completed); clinical summary stays out of logs |
| 5 | ✅ **Service estimates** (done 2026-11-09) | Cost transparency before treatment | `service_estimates` lifecycle (issued → accepted/rejected); patient review & approval |
| 6 | ✅ **Operator tools** (done 2026-11-09) | Spot stuck requests (SLA timers, e.g. no offer within 2 working hours), audit-log viewer | Real-time SLA breach/warning detection, append-only audit trail viewer |
| 7 | ✅ **Search by problem and area** (2026-11-11, replaced the matching score) | Show clinics that treat the problem, nearest first | Problem → specialties; same area, same state, elsewhere. No geocoding yet |
| 8 | ✅ **Secure uploads** (done 2026-11-09) | Patients attach photos/X-rays | `clinical_documents`, pre-signed S3 and mock upload/download URLs; files never in MySQL |
| 9 | ✅ **Payments** (done 2026-11-09) | After commercial and regulatory review | Paystack integration adapter + mock gateway, webhook signature verification, payment receipts |
| 10 | ✅ **Installable web app (PWA)** (done 2026-11-09) | Most patients will be on phones; a PWA avoids separate native apps for now | Web app manifest + offline service worker on `apps/web` |

## Next after the MVP realignment

- [ ] Per-dentist capacity (several patients at once in a multi-chair centre).
- [ ] Distance ranking (geocode addresses) instead of area text.
- [ ] Estimates beyond the consultation fee; late/no-show fees shown before booking.
- [ ] Appointment reminders the day before.
- [ ] One-time code for clinic staff signing in on a new device.
- [ ] Screen for admins to create operator accounts (today: seed or SQL).

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

- [x] OpenAPI spec for `/api/v1` and interactive Swagger UI docs (`/api/v1/docs`).
- [x] Browser end-to-end tests (Playwright) config and journey test suite in `apps/web`.
- [x] Clear dev tooling advisories and maintain 0 runtime vulnerabilities.
