# 0001 — API foundation and conventions

- **Status:** accepted (point 7 superseded by [0003](0003-migrations.md); repo layout extended by [0002](0002-web-app.md))
- **Date:** 2026-11-04

## Context
The original MVP was a single-file JavaScript Express API. A review found that self-registered
provider staff could read every patient's request description and act for any provider; the error
handler turned 404/409 into 500; accepting an offer did not update the request; the Docker build
failed (no lockfile, wrong `DB_HOST`); and the schema had no migration path.

## Decision
1. Keep **Node.js + Express + MySQL 8** as chosen in the product design; move to **TypeScript (strict)**
   while the codebase is small.
2. Monorepo layout with the API in `apps/api`; product docs in `docs/`.
3. Modular structure (routes / schema / service / repo per domain) with a shared `AppError`, response
   envelope, Zod validation, audit helper and a central state machine.
4. Two-layer authorisation: platform role + provider membership. Provider staff self-register as
   `pending`. New `operator` role for CareBridge coordinators who match requests manually during the pilot.
5. **The patient accepts/declines offers.** Accepting assigns the provider and expires other offers; it is
   not an appointment.
6. Patients must answer `has_emergency_symptoms`; `true` is refused with emergency guidance (422).
7. Plain numbered SQL migrations with a tiny runner (`schema_migrations` table) instead of an ORM.
8. Vitest + Supertest against a real MySQL; GitHub Actions CI.

## Consequences
- The v1 API is not backwards compatible with the original MVP routes (new `/api/v1` prefix, offer
  endpoints renamed to `POST /requests/:id/offers` and `POST /offers/:id/accept|decline|withdraw`,
  response envelope added). No clients existed yet, so there is no migration cost.
- Emergency guidance text and numbers need clinical-governance sign-off before the pilot.
- Revisit npm workspaces when `apps/web` is added.
