# CareBridge

Coordinated access to verified healthcare providers — starting with a dental-care pilot in Lagos.
Patients pick their problem and when they're free, see verified clinics near them with open times, and book;
the clinic confirms, checks them in and records the outcome as notes (prescription, referral, follow-up).

| App | Path | Stack |
|---|---|---|
| API | [`apps/api`](apps/api) | Node.js · TypeScript · Express · MySQL 8 |
| Web | [`apps/web`](apps/web) | React · Vite · TypeScript (patient, provider and operations portals) |

## Quick start

```bash
cp .env.example .env              # replace every secret
docker compose up --build         # db + api (runs migrations) + web
docker compose exec -e NODE_ENV=development api node dist/db/seed.js   # sample data
```

Open **http://localhost:3000**. Seeded accounts use the password `CareBridge!2026`:
`patient@`, `owner.lekki@`, `operator@`, `admin@` — all `@carebridge.local`.

For local development without Docker, see [docs/development.md](docs/development.md).

## Documentation

Everything lives in [`docs/`](docs/README.md):
[conventions](docs/CONVENTIONS.md) · [architecture](docs/architecture.md) · [API](docs/api.md) ·
[data model](docs/data-model.md) · [migrations](docs/migrations.md) · [development](docs/development.md) ·
[deployment](docs/deployment.md) · [security](docs/security.md) · [decisions](docs/decisions/) ·
[product design](docs/product/).

## Status

Pilot foundation — not yet a clinically validated or production-certified system. See
[docs/security.md → Before launch](docs/security.md#before-launch) and the
[deployment checklist](docs/deployment.md#launch-checklist-before-real-patient-data).
