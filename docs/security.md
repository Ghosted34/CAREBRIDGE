# Security & privacy

CareBridge handles health information about people in Nigeria, so the Nigeria Data Protection Act 2023
(and NDPC guidance) applies, as do health-sector confidentiality expectations. This page records what the
code does today and what must happen before launch. It is not legal advice; get a formal review.

## What's in place

| Area | Control |
|---|---|
| Authentication | bcrypt (cost 12) passwords; JWT (HS256) with `sub` + `role` only; 8 h expiry; constant-time-ish login (dummy hash for unknown emails) and identical errors for unknown email vs wrong password |
| Account lifecycle | Provider staff self-register as **pending**; admin approves and links them. Suspension takes effect on the next request (user reloaded every time) |
| Authorisation | Platform role + provider membership on every provider-scoped action; patients only see their own data; 404 (not 403) for other people's records |
| Data minimisation | Public directory exposes non-sensitive provider fields only; provider staff see only requests that match their verified providers; patient contact only for the assigned provider and CareBridge staff |
| Integrity | Every status change through one state machine; transactions + row locks; booking serialised per provider |
| Audit | Every write records actor, action, entity, IP and non-clinical metadata in the same transaction |
| Logging | pino with redaction of `authorization`, passwords, hashes, `description`, `clinical_summary` |
| Input | Zod validation on every body, query and path parameter; 100 kB body limit; parameterised SQL only |
| Transport/browser | helmet on the API; nginx CSP (`default-src 'self'`, no inline scripts), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'` |
| Abuse | Rate limits: 300/15 min per IP, 20/15 min on auth endpoints |
| Safety | Emergency symptoms are refused with guidance and never queued |
| Consent | Terms/privacy at sign-up; data-sharing consent (current version) before a request reaches clinics; append-only history with source and IP; withdrawing data sharing pulls open requests |
| Notifications | No clinical text in any notification (payload keys checked in code, tested); generic SMS wording; addresses masked in logs |
| Config | Env validated at start-up; API won't start with a short `JWT_SECRET` |

## Known trade-offs

- **Token in `sessionStorage`.** Survives reloads, cleared when the tab closes, but readable by any script
  that runs on the page. Mitigated by the strict CSP and no third-party scripts. Planned: move to an
  httpOnly, `SameSite=Strict` cookie with CSRF protection.
- **No refresh tokens / server-side revocation.** Suspension is immediate (user reloaded per request), but
  a stolen token for an active user is valid until expiry. Planned: short access tokens + refresh rotation.
- **Rate limiting is in-memory**, per API instance. Use a shared store (Redis) before running more than one.

## Before launch

- [ ] OTP/MFA for provider staff, operators and admins; phone/email verification for patients.
      *Decided 2026-11-09:* staff get a one-time code on a **new device** only (not every sign-in). Deferred — built later.
- [ ] Password reset flow.
- [x] Consent capture at sign-up and before sharing with a provider. Policy wording still needs legal review.
- [ ] Encrypted object storage with signed URLs for any images/documents — never in MySQL text columns.
- [ ] Encryption at rest for the database volume and backups.
- [ ] Data retention and deletion policy; a process for data-subject requests (access, correction, deletion).
- [ ] Penetration test and dependency/vulnerability scanning in CI.
- [ ] Incident response plan, including NDPC breach notification timelines.
- [ ] Data processing agreements with providers; clinical governance sign-off of emergency wording.
- [ ] Review audit-log access: who can read it, how long it's kept.

## Rules for contributors

1. Never log, audit, or put in an error message any clinical text or full personal record.
2. New endpoint → decide who may call it, enforce it in the service, and test the *denied* case.
3. Return 404 rather than 403 when a caller shouldn't learn that a record exists.
4. No new third-party scripts, fonts or trackers in the web app without updating the CSP and this page.
5. Real patient data never leaves production — no copies in dev, tests, tickets or chat.
