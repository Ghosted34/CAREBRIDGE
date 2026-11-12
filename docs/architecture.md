# Architecture

CareBridge (branded CareLynk in the app) is a coordination layer between patients and existing dental
capacity in Lagos. It does not run clinics or the consultation itself: it shows a patient verified clinics near
them with real free times, books one, and records what happened — check-in, and the clinic's notes
(prescription, referral, follow-up, closing). Consultations can be in person or by video/voice call arranged
by the clinic; CareLynk only needs to know it happened.

## Components

```mermaid
flowchart LR
  subgraph Browser
    W[Web app<br/>React + Vite]
  end
  subgraph Server["Docker host"]
    N[nginx<br/>static files + /api proxy] --> A[API<br/>Node + Express + TS]
    A --> D[(MySQL 8)]
    K[Worker<br/>SMS + email] --> D
  end
  W -- HTTPS --> N
```

| Component | Where | Responsibility |
|---|---|---|
| Web app | `apps/web` | Patient, provider and operations portals. Pure client; holds no business rules it can't get from the API. |
| nginx | `apps/web/nginx.conf` | Serves the built SPA, proxies `/api` and `/health` to the API so the browser sees one origin (no CORS), sets security headers. |
| API | `apps/api` | All business rules, permissions, state transitions, audit logging. Stateless; scale horizontally. |
| MySQL | `docker-compose.yml` | System of record. Schema owned by migrations in `apps/api/src/db/migrations`. |
| Worker | `apps/api/src/worker.ts` | Sends queued SMS/email notifications with retries. Same image as the API; several can run at once. |

Planned: more SMS/email provider adapters, one-time codes for staff on new devices, payment gateway webhooks,
encrypted object storage for clinical documents.

## The booking flow

Providers are **clinics** (facilities of dentists) with one or more **operating centres**. A **visit**
(`care_requests`) is one problem from first booking to closing note; it can hold several **appointments**.
Decision record: [ADR 0005](decisions/0005-mvp-realignment.md).

```mermaid
sequenceDiagram
  actor P as Patient
  participant API
  actor S as Clinic staff
  P->>API: POST /search (problem, periods I'm free)
  Note over API: centres of verified clinics that treat it,<br/>free times = opening hours − bookings, nearest area first
  P->>API: POST /appointments (centre, free time, emergency answer)
  Note over API: emergency=yes → 422 + 112/767 guidance, nothing stored<br/>else visit + appointment (requested), time re-checked under a centre lock
  API-->>S: notification: new booking request
  S->>API: confirm (or decline)
  S->>API: check-in (or no-show)
  S->>API: POST /appointments/:id/notes (prescription, referral, follow-up…)
  S->>API: book follow-up (confirmed) or closing note → visit closed
  API-->>P: notified; reads the notes on the visit page
```

Status machines for every entity are defined once in `apps/api/src/lib/stateMachine.ts`; see
[data-model.md](data-model.md#status-machines).

## Notifications

A **transactional outbox**: services call `notify(tx, users, template, payload)` inside the same transaction
as the change, so a notification exists if and only if the change committed. In-app rows are delivered
immediately (the web bell polls `/notifications/unread-count`); SMS/email rows are `queued` and the worker
sends them, retrying after 1, 2, 4, 8 minutes, then marking them `failed` after 5 attempts. Rows for a
switched-off channel, a missing address or a suspended user are `skipped`.

| Event | Who is told | Channels |
|---|---|---|
| Booking requested | owners/clinicians/schedulers of that clinic | in-app, email |
| Follow-up booked by the clinic | the patient | in-app, SMS |
| Booking confirmed | the patient | in-app, SMS |
| Booking declined or cancelled | the other side | in-app + SMS (patient) / email (clinic) |
| Note added after a visit | the patient (no note text in the message) | in-app |
| Visit cancelled | the clinic | in-app |
| Staff account approved | that staff member | in-app, email |
| Added to a clinic team | that staff member | in-app, email |

Messages never contain clinical text: payloads hold only IDs, clinic names and times (enforced in code and
tested), and SMS text is deliberately generic. Templates live in `modules/notifications/templates.ts`.
Providers (Termii, SMTP, …) are adapters behind one typed interface: [notifications.md](notifications.md).

## Authorisation model

Two layers, checked on every request:

1. **Platform role** on the user: `patient`, `provider_staff`, `operator`, `admin` (route middleware `allow`).
2. **Provider membership** for anything provider-scoped: the user must be linked to that provider
   (`provider_users`) with a suitable role (`owner`, `clinician`, `scheduler`, `receptionist`), and the provider
   must be verified and active. Operators/admins pass this check.
   Where a pending clinic needs a clear answer rather than a bare 403, services check the membership role first
   and the facility's verification second (`providers.service.ts`), so an owner hears
   `409 PROVIDER_NOT_VERIFIED`.

| Action | Who |
|---|---|
| Search; book a new visit | the patient |
| Book a follow-up on a visit | the patient; staff of that clinic |
| Confirm / decline / check in / no-show / complete | staff of the clinic; operator; admin |
| Write a prescription or referral note | owner or clinician of the clinic |
| Write a follow-up or closing note | owner, clinician or scheduler of the clinic |
| Read notes | the patient and staff of the clinic only |
| Centres, dentists, fees | owner of the clinic; operator; admin (opening hours: owner or scheduler) |
| Add / remove clinic team members | owner of that verified clinic; operator; admin |
| Verify providers, approve staff, link members | admin |

The API reloads the user on every request, so suspending an account takes effect immediately.

## Request handling inside the API

```
HTTP → helmet/cors/json/rate-limit → router (/api/v1)
     → authenticate (JWT → reload user) → allow(roles)
     → route: parse(ZodSchema, input)
     → service: permission checks, assertTransition, withTransaction { repo calls…, audit(tx) }
     → { data } | AppError → errorHandler → { error: { code, message, details } }
```

## Time, money, identifiers

- Times: UTC in the database and the API (ISO-8601 with offset); the web shows Africa/Lagos (UTC+01:00, no DST).
- Money: `DECIMAL(14,2)` + `currency CHAR(3)`, default `NGN`.
- IDs: `BIGINT UNSIGNED AUTO_INCREMENT`. Not secret — authorisation never relies on IDs being unguessable.
