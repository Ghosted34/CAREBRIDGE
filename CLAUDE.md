# CLAUDE.md

Guidance for AI coding sessions in this repo. **Read `docs/CONVENTIONS.md` first — it is binding.**
All documentation lives in `docs/` (index: `docs/README.md`).

## What this is
CareBridge (branded **OnDiGoH** in the UI): dental care coordination, Lagos pilot. A patient picks a problem
and the periods they're free; `POST /search` shows verified clinics' centres near them that treat it, with free
times computed from opening hours minus bookings; the patient books one; the clinic confirms, checks them in and
adds notes (prescription, referral, follow-up, closing). A care request is a "visit". The old offer round,
operator queue and multi-stage journey are retired (tables kept) — see `docs/decisions/0005-mvp-realignment.md`.

## Apps and commands
- `apps/api` (Express + MySQL): `npm run dev` · `npm run dev:worker` (SMS/email worker) · `npm test` (real MySQL) · `npm run migrate` /
  `migrate:status` / `migrate:down` / `migrate:new -- <name>` / `migrate:verify` · `npm run seed` (dev/demo data from a staging run) · `npm run admin:create`
- `apps/web` (React + Vite): `npm run dev` (proxies /api to :4000) · `npm test` · `npm run build`
- Both: `npm run lint && npm run typecheck && npm run format:check`

## Non-negotiables
- API layering: routes → service → repo. No SQL in routes, no `req` in services/repos.
- Every status change via `assertTransition` (`apps/api/src/lib/stateMachine.ts`); every provider-scoped
  action via `assertCanActForProvider`; every write audited in the same transaction.
- Errors: throw `AppError`; responses are `{ data }` / `{ data, meta }` / `{ error: { code, message } }`.
- Schema changes: a new migration via `migrate:new`, one change per file, up + down, never edit an applied one.
  See `docs/migrations.md`.
- Web: data only through React Query + `src/api/endpoints.ts`; times via `src/lib/time.ts` (Africa/Lagos);
  status labels via `src/lib/labels.ts`; keep `src/api/types.ts` in step with API responses.
- Notifications: call `notify(tx, …)` inside the transaction; never put clinical text in a payload.
  SMS/email providers are adapters (`modules/notifications/providers/`); add new ones per docs/notifications.md.
- Never log, audit or expose clinical text where it isn't needed. Never weaken the emergency redirect.
- Opening hours are Lagos wall-clock (fixed UTC+01:00, `lib/lagosTime.ts`); the DB stores UTC. Anything that
  books a time locks the centre row first (`findBookableCentre(…, { forUpdate: true })`) before any other read.
- SQL must also run on MariaDB (cPanel): no `JSON_OVERLAPS`, no `FOR UPDATE OF`.
- Tests with every behaviour change, including the *denied* permission case. Keep all suites green.
- Update `docs/api.md` / `docs/data-model.md` in the same change as endpoints/schema.
- Don't run git commands that commit, push or change history — the owner handles git.
