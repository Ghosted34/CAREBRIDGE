# CLAUDE.md

Guidance for AI coding sessions in this repo. **Read `docs/CONVENTIONS.md` first — it is binding.**
All documentation lives in `docs/` (index: `docs/README.md`).

## What this is
CareBridge: healthcare coordination platform (Lagos, dental pilot). Patients submit care requests,
verified providers make offers, the patient accepts one, appointments are booked, and the assigned provider
moves the journey through assessment → treatment → completed. Product vision: `docs/product/`.

## Apps and commands
- `apps/api` (Express + MySQL): `npm run dev` · `npm run dev:worker` (SMS/email worker) · `npm test` (real MySQL) · `npm run migrate` /
  `migrate:status` / `migrate:down` / `migrate:new -- <name>` / `migrate:verify` · `npm run seed`
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
- Tests with every behaviour change, including the *denied* permission case. Keep all suites green.
- Update `docs/api.md` / `docs/data-model.md` in the same change as endpoints/schema.
- Don't run git commands that commit, push or change history — the owner handles git.
