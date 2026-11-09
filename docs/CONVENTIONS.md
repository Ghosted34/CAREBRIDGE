# CareBridge Conventions

These are the rules of the road for everyone (people and AI assistants) working on CareBridge.
If a convention gets in the way, change this file in a PR — don't silently work around it.

---

## 1. Repository layout

```
CARE_BRIDGE/
├── apps/
│   ├── api/            Node.js + TypeScript + Express + MySQL 8 API
│   └── web/            React + Vite + TypeScript web app (patient, provider, operations portals)
│   (mobile/)           planned: React Native / Expo
├── docs/               all documentation — start at docs/README.md
│   ├── decisions/      Architecture Decision Records (ADRs)
│   └── product/        product design doc + original HTML prototype
├── .github/workflows/  CI
├── docker-compose.yml  local / pilot stack (db + api + web)
├── README.md           short entry point
└── CLAUDE.md           instructions for AI coding sessions
```

- Each app owns its own `package.json` and `package-lock.json`. No npm workspaces yet (see ADR 0002).
- `package-lock.json` is always committed. Install with `npm ci` in CI and Docker.
- Documentation lives in `docs/`, never scattered through the code tree. App-specific notes that
  developers need while coding go in code comments, not separate files.

## 2. Git workflow

- **Branches:** `main` is always deployable. Work on short-lived branches:
  `feat/<topic>`, `fix/<topic>`, `chore/<topic>`, `docs/<topic>`, `refactor/<topic>`, `test/<topic>`.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) with the app or module as scope:
  ```
  feat(offers): let providers withdraw open offers
  fix(web): anchor booking time picker to midnight so 5-minute steps validate
  chore(db): add index on appointments.care_request_id
  ```
  Breaking API changes: add `!` (`feat(api)!: ...`) and a `BREAKING CHANGE:` footer.
- **Pull requests:** one concern per PR; CI must be green; describe *what* and *why*; call out any
  **migration**, env-var or API-contract change in the description. Squash-merge into `main`.
- Never commit `.env`, secrets, real patient data, or database dumps.

## 3. Language & style (both apps)

- **TypeScript, strict mode** (`strict`, `noUncheckedIndexedAccess`). No `any` unless commented why.
- **Prettier** formats (single quotes, trailing commas, width 100). **ESLint** must pass with zero errors.
  Run `npm run format && npm run lint` in the app you changed before pushing.
- No `console.*` — API uses `logger` (`src/lib/logger.ts`); the web app shows errors in the UI.
- Comments explain **why**, not what. Business rules get a one-line comment where they are enforced.

### Naming

| Thing | Convention | Example |
|---|---|---|
| API files | `<module>.<layer>.ts` | `offers.service.ts` |
| React components & their files | PascalCase | `BookingForm.tsx` |
| Other web files (hooks, helpers) | camelCase | `useOfferableProviders.ts`, `time.ts` |
| Variables / functions | camelCase | `memberProviderIds` |
| Types / classes / Zod schemas | PascalCase | `CreateOfferBody`, `AppError` |
| Constants | UPPER_SNAKE | `EMERGENCY_GUIDANCE` |
| DB tables & columns | snake_case, plural tables | `provider_offers.care_request_id` |
| DB constraints & indexes | `pk_/fk_/uq_/idx_/chk_<table>_<what>` | `fk_appointments_provider` |
| JSON request/response fields | **snake_case** (mirrors the DB) | `assigned_provider_id` |
| Audit actions | UPPER_SNAKE, `ENTITY_VERB_PAST` | `OFFER_ACCEPTED` |
| Error codes | UPPER_SNAKE | `SLOT_UNAVAILABLE` |
| Migration files | `YYYYMMDDHHmm_snake_case.sql` | `202611041100_add_operator_role_to_users.sql` |

> On Windows, file names are case-insensitive: never have two files whose names differ only by case
> (e.g. `authContext.ts` and `AuthContext.tsx`).

## 4. API structure

Code is organised **by domain module**, each with up to four layers:

```
apps/api/src/modules/<domain>/
  <domain>.routes.ts    HTTP only: auth/role middleware, parse input, call service, send response
  <domain>.schema.ts    Zod schemas for bodies/queries
  <domain>.service.ts   business rules, permission checks, transactions, audit logging
  <domain>.repo.ts      SQL only — no business rules, no HTTP
```

- Routes never contain SQL. Repos never throw `AppError` for business reasons and never read `req`.
- A service is required whenever there are business rules, permission checks beyond a role, or writes.
  Public read-only endpoints with no rules (e.g. the provider directory) may call the repo directly.
- Shared helpers live in `src/lib/` (errors, validation, access control, audit, state machine, http).
- Cross-module calls go service → other module's **repo** (not its routes or service, to avoid cycles).

### Endpoints

- All endpoints live under **`/api/v1`**. `/health` is unversioned.
- Resources are plural nouns: `/requests`, `/offers`, `/appointments`.
- Nested creation where the parent matters: `POST /requests/:id/offers`.
- **State changes are explicit verbs**, never a generic `PATCH status`:
  `POST /offers/:id/accept`, `POST /requests/:id/start-assessment`, `POST /appointments/:id/check-in`.
  When several verbs share one rule set, define them in a map in the service (see `JOURNEY_STEPS`,
  `PROVIDER_ACTIONS`) and register one route per key.
- Lists accept `?limit=` (default 50, max 100) and `?offset=`.
- Full reference: [docs/api.md](api.md). Update it in the same PR as any endpoint change.

### Responses

```jsonc
{ "data": { ... } }                                              // single resource
{ "data": [ ... ], "meta": { "limit": 50, "offset": 0, "count": 12 } }  // list
{ "error": { "code": "SLOT_UNAVAILABLE", "message": "...", "details": { } } }  // error, always this shape
```

| Status | When |
|---|---|
| 400 `VALIDATION_ERROR` | Input fails Zod (details = `fieldErrors`) |
| 401 | Missing/invalid token |
| 403 | Authenticated but not allowed (wrong role / not a member of that provider) |
| 404 | Not found **or** the caller may not know it exists (another patient's request) |
| 409 | Conflict: duplicate, invalid state transition, slot taken |
| 422 | Valid input we deliberately refuse (e.g. `EMERGENCY_REDIRECT`) |

- Throw `AppError` (`AppError.notFound('Offer')`, `.forbidden()`, `.conflict(code, msg)`).
  Anything else becomes a logged 500 with a generic message.
- Validate **everything** from the client with `parse(schema, input)` — body, query and `:id` params.

## 5. Web app structure

```
apps/web/src/
  api/          client.ts (fetch + ApiError), endpoints.ts (one function per endpoint), types.ts
  auth/         authContext.ts (useAuth, homePathFor), AuthProvider.tsx, RequireRole.tsx
  components/   shared UI: ui.tsx (Button, Field, Modal, Pill…), Layout, BookingForm, Journey
  features/     one folder per area: public/, auth/, patient/, provider/, admin/
  lib/          pure helpers: time.ts (Lagos time), labels.ts (status → label/tone), errors.ts
  styles/       app.css (design tokens from the prototype + component classes)
  test/         setup + render helpers
```

- **Data fetching only through React Query + `api.*` functions.** Components never call `fetch`.
  Query keys start with the resource: `['requests', 'mine']`, `['appointments', 'mine']`, `['admin', …]`.
  After a mutation, invalidate the resource prefix that changed.
- **The API is the source of truth for rules.** The UI may hide actions a user can't take, but must
  still handle the API refusing (show `error.message`; map `fieldErrors` onto fields).
- `api/types.ts` mirrors API responses by hand. Change it in the same PR as the API response.
- **Time:** the API speaks UTC; the UI shows and accepts **Africa/Lagos** (fixed UTC+01:00) via `lib/time.ts`.
  Never format dates with the browser's local zone.
- **Status labels/colours** come from `lib/labels.ts` — never hard-code a status string in a component.
- **Accessibility:** every input through `<Field>` (label + error wired up), real `<button>`s and links,
  visible focus, `role="alert"` for errors. Test with the keyboard.
- **Styling:** plain CSS with the tokens in `styles/app.css`; reuse existing classes before adding new ones.
  No inline colours.
- The session token is kept in `sessionStorage` (see [docs/security.md](security.md) for the trade-off).

## 6. Auth & permissions

Two layers, both mandatory:

1. **Platform role** (`users.role`): `patient`, `provider_staff`, `operator`, `admin`.
   Checked in routes with `allow(...)`.
2. **Provider membership** (`provider_users.provider_role`): `owner`, `clinician`, `scheduler`, `receptionist`.
   Checked in services with `assertCanActForProvider(db, user, providerId, roles)`.
   Operators and admins pass this check (they coordinate on CareBridge's behalf).

Rules:
- Self-registration can only create `patient` or `provider_staff`, and every account starts the way the API
  says it does: patients `active`, provider staff **pending** (they can't sign in until activated).
- **Clinic self-onboarding:** a `provider_staff` may register their own facility (`clinic` on
  `POST /auth/register`). One transaction creates the pending user, a **pending** provider and an `owner`
  membership, audited `PROVIDER_SELF_REGISTERED`. Nothing is public and the owner can't sign in until an admin
  verifies the facility **and** activates the account. After that the `owner` manages their own team
  (`GET`/`POST /providers/:id/team`, `DELETE /providers/:id/team/:userId`, `GET /staff-accounts`) for
  `clinician`/`scheduler`/`receptionist` — no admin step per member. Admin linking (`POST
  /admin/providers/:id/members`) stays for staff who registered without facility details. `owner` is never
  appointable through the team endpoints, and an owner's own membership can't be removed there.
- `authenticate` reloads the user on every request, so suspension takes effect immediately.
- JWTs carry only `sub` (user id) and `role`. Never put PII or clinical data in a token.
- Every permission rule gets a test proving both the allowed and the denied case.

## 7. Domain rules (from the product design)

- **Request ≠ offer ≠ referral ≠ appointment ≠ treatment.** Separate records, separate lifecycles.
  Accepting an offer assigns a provider; it does **not** create an appointment.
- **The patient accepts or declines offers.** Providers (or operators, for manual matching) make them.
- **Only the assigned provider's owners/clinicians progress the clinical journey**
  (assessment → treatment planned → in treatment → completed).
- **Every status change goes through `src/lib/stateMachine.ts`** (`assertTransition`). To add a status or
  transition: state machine first, then a migration for the ENUM, then the code, then the web labels.
- **Post-visit governance.** Cost estimates, specialist referrals, `plan-treatment` and `start-treatment`
  need at least one appointment for that request with status `checked_in` or `completed`
  (`assertVisitHappened` → `409 VISIT_REQUIRED`, nothing written). Booking, `start-assessment` and `complete`
  are not gated. Check permissions and the transition **first**, so a wrong role still gets 403.
- **Patients may pick a clinic.** `POST /requests` with `target_provider_id` routes the request straight to that
  verified clinic (state machine `submitted → provider_accepted`, audited, `request_directed` notification) and
  keeps it out of the open queue. An unusable target is `404` with no row stored.
- **Emergencies are never queued.** `has_emergency_symptoms: true` returns 422 `EMERGENCY_REDIRECT`.
  The guidance text must be approved by clinical governance before launch.
- Only verified + active providers appear publicly, receive queue items, or can be booked.
- Clinical decisions belong to licensed professionals; the platform facilitates, it does not diagnose.

## 8. Database & migrations

Full guide: [docs/migrations.md](migrations.md). The rules:

- **Every schema change is a migration** in `apps/api/src/db/migrations/`, created with
  `npm run migrate:new -- <snake_case_name>`. Never change the schema by hand in any shared environment.
- **One logical change per file.** One `CREATE TABLE` per create migration; one `ALTER`/`CREATE INDEX`
  per update migration where possible (MySQL DDL auto-commits, so a multi-statement file can half-apply).
- **Every file has `-- migrate:up` and `-- migrate:down`.** The down must exactly undo the up. If the down
  loses data (e.g. dropping a column), say so in a comment at the top.
- **Never edit or delete a migration once it has been applied anywhere shared** (the runner stores a
  checksum and refuses to continue). Fix mistakes with a new migration.
- **Order:** tables are created parents-first (FK order). If your branch's migration ends up older than one
  already merged, rename it with a newer timestamp before merging.
- **Name every constraint and index** (`fk_`, `uq_`, `idx_`, `chk_`) so later migrations can alter/drop them.
- **Expand → migrate → contract** for changes to live data: add the new column (nullable or with default),
  deploy code that writes both, backfill, then remove the old column in a later release.
- No `;` inside string literals in migrations (the runner splits statements on `;` at line end).
- Times are UTC everywhere (DB session `time_zone = '+00:00'`). Money is `DECIMAL(14,2)` + `currency CHAR(3)`.
- Use transactions (`withTransaction`) for multi-row writes and `SELECT … FOR UPDATE` on rows whose
  state you're about to change. Bookings lock the provider row to serialise per provider.
- mysql2: `.execute()` for parameterised queries, `.query()` when binding `LIMIT/OFFSET`. Always parameterise;
  the only dynamic SQL allowed is placeholder lists (`IN (?, ?, ?)`) built from arrays.

## 9. Security & privacy (NDPA 2023 mindset)

Full notes: [docs/security.md](security.md).

- **Audit every write** with `audit(tx, {...})` inside the same transaction. Audit `metadata` holds IDs and
  status changes only — never clinical text.
- Clinical text (`description`, `clinical_summary`) never goes into logs, tokens, error messages, analytics,
  or the public directory.
- Data minimisation: lists return only what the caller needs. Patient contact details go only to the
  assigned provider and CareBridge staff.
- Secrets come from env vars validated in `src/config/env.ts`; the API refuses to start if invalid.

## 10. Testing

| App | Tool | Rules |
|---|---|---|
| API | Vitest + Supertest against **real MySQL** (`carebridge_test`) | No DB mocks. Each endpoint: happy path + validation failure. Each permission rule: allowed **and** denied. Each transition: valid and invalid. Concurrency-sensitive code: a parallel test. |
| API migrations | `test/migrations.test.ts` on a scratch DB | Full up → down → up round trip must pass; new migration rules get a test. |
| Web | Vitest + Testing Library + jsdom | Test behaviour through the UI (labels, roles), mocking `fetch` with `test/utils.tsx`. Cover safety-relevant flows (emergency redirect, guards) and pure helpers (`lib/`). |

`npm test` must pass in every app you touched, locally and in CI, before merge.

## 11. Configuration & environments

- New env var → add to `apps/api/src/config/env.ts` (Zod), both `.env.example` files, and
  [docs/deployment.md](deployment.md).
- `NODE_ENV`: `development` | `test` | `production`. The seed script refuses to run in production;
  `migrate:down` needs `--yes` in production.

## 12. Documentation

- Significant decisions (tech choice, data-model change, security trade-off) get an ADR in
  `docs/decisions/NNNN-title.md`: context → decision → consequences.
- Keep [docs/api.md](api.md) and [docs/data-model.md](data-model.md) in step with the code, in the same PR.
