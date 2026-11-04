# 0002 — Web app stack and structure

- **Status:** accepted
- **Date:** 2026-11-04

## Context
The product design calls for a patient web app, a clinic/specialist portal and a CareBridge operations
dashboard. The API is ready to serve them. We want one codebase the team can maintain, that looks like the
approved HTML prototype, and that keeps all rules on the server.

## Decision
1. **One React app (`apps/web`)** with three role-based areas (`/patient`, `/provider`, `/ops`), not three apps.
   Routes are guarded by role; the API still enforces every permission.
2. **Vite + React 19 + TypeScript**, **React Router** (declarative routes), **TanStack Query** for all server
   state. No global state library; auth lives in a small context backed by React Query (`GET /me`).
3. **Plain CSS with design tokens** taken from the prototype (teal/gold), no UI framework — small bundle,
   no third-party scripts, easy to keep the CSP strict.
4. **Same origin in every environment:** Vite proxies `/api` in development; nginx proxies it in Docker.
   No CORS, and the CSP can be `connect-src 'self'`.
5. **Hand-written response types** in `src/api/types.ts`, updated in the same PR as API changes. No npm
   workspaces or shared package yet; revisit with OpenAPI generation once the API stabilises or a mobile app
   needs the same types.
6. **Times shown in Africa/Lagos** regardless of the browser's zone (pilot is Lagos-only; Lagos has no DST).
7. **Session token in `sessionStorage`** for the pilot (see security.md for the trade-off and the plan to
   move to httpOnly cookies).
8. **Tests:** Vitest + Testing Library for behaviour and helpers; the full journey was verified end to end in
   a real browser against the real API.

## Consequences
- The API gained endpoints the portals need: `GET /requests/assigned`, journey steps
  (`/requests/:id/start-assessment|plan-treatment|start-treatment|complete`), `GET /offers/mine`,
  appointment `check-in|complete|no-show`, `GET /admin/providers`, `GET /admin/providers/:id/members`, and
  `patient_name` on appointment lists.
- Type drift between API and web is possible until we generate types; reviewers check `types.ts` when an API
  response changes.
- `react-router` 8 requires Node ≥ 22.22 for tooling.
