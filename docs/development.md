# Development guide

## Prerequisites

- **Node.js 22 LTS, version 22.22 or newer** (or Node 24 LTS). `.nvmrc` pins major 22.
  Node 20 is end-of-life (April 2026) and the toolchain (Vitest 5, React Router 8, jsdom) no longer supports it.
- **MySQL 8** — either **Docker Desktop** (easiest) or a local MySQL 8 install.
- Git, and an editor with ESLint + Prettier + EditorConfig support.

Check: `node -v` → `v22.22.x` or higher.

Commands below work in PowerShell, Git Bash and macOS/Linux shells; where they differ, both are shown.

---

## Option A — run everything in Docker (quickest way to click around)

```powershell
# from the repo root
copy .env.example .env          # Git Bash / macOS / Linux: cp .env.example .env
```

Edit `.env`: set `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`, and `JWT_SECRET` (at least 32 characters). Then:

```powershell
docker compose up --build -d
docker compose logs api          # wait for "[migrate] done, 18 applied" and "CareBridge API listening"
docker compose exec -e NODE_ENV=development api node dist/db/seed.js
```

Open **http://localhost:3000** and sign in with a [seeded account](#seeded-accounts).

Stop with `docker compose down` (data stays in the `mysql_data` volume). Start again from an empty database:
`docker compose down -v` then `up` again.

> Port 3306 already in use? You have a local MySQL running. Stop it, or change `'127.0.0.1:3306:3306'` in
> `docker-compose.yml` to `'127.0.0.1:3307:3306'` (and use port 3307 in Option B).

---

## Option B — run the apps on your machine (best for coding and running tests)

### 1. A MySQL database

**Using Docker for MySQL only:**

```powershell
copy .env.example .env           # set DB_PASSWORD and MYSQL_ROOT_PASSWORD
docker compose up -d db
```

**Or a local MySQL 8 install:** open a MySQL shell as root (`mysql -u root -p`) and run:

```sql
CREATE DATABASE carebridge CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'carebridge'@'localhost' IDENTIFIED BY 'change-me';
GRANT ALL ON carebridge.* TO 'carebridge'@'localhost';
```

### 2. Allow the tests to create their own databases (once)

The API tests create and drop `carebridge_test` and `carebridge_migrations_test`. They never touch `carebridge`.
Give the `carebridge` user rights on databases starting with `carebridge_`:

```powershell
docker compose exec db mysql -u root -p     # local install: mysql -u root -p
```

```sql
-- Docker MySQL (user created by Compose as 'carebridge'@'%'):
GRANT ALL ON `carebridge\_%`.* TO 'carebridge'@'%';
-- Local MySQL install (user created above as 'carebridge'@'localhost'):
GRANT ALL ON `carebridge\_%`.* TO 'carebridge'@'localhost';
```

Only run the line that matches your setup (the other will report that the user doesn't exist).

### 3. API

```powershell
cd apps/api
copy .env.example .env           # cp on Git Bash / macOS / Linux
```

Edit `apps/api/.env`: `DB_PASSWORD` = the password from step 1, and a `JWT_SECRET` of 32+ characters.
(`DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_USER=carebridge`, `DB_NAME=carebridge` are already set.)

```powershell
npm install
npm run migrate:status           # shows 18 pending
npm run migrate                  # creates the tables
npm run seed                     # sample accounts + two Lagos clinics
npm run dev                      # http://localhost:4000 — restarts when you save
```

Optional third terminal, to see SMS/email notifications printed to the console (in-app notifications work
without it):

```powershell
cd apps/api
npm run dev:worker
```

Check it: open http://localhost:4000/health → `{"status":"ok",...}`.

### 4. Web (second terminal)

```powershell
cd apps/web
npm install
npm run dev                      # http://localhost:3000 — /api calls are proxied to :4000
```

Open **http://localhost:3000**. The sign-in page lists the seeded accounts in development.

---

## Seeded accounts

`npm run seed` is safe to run repeatedly (it skips anything that already exists) and refuses to run when
`NODE_ENV=production`. Every account uses the password **`CareBridge!2026`** (set `SEED_PASSWORD` to change it
before seeding).

| Email | Role | What to try |
|---|---|---|
| `patient@carebridge.local` | Patient | New request → choose an offer → book |
| `owner.lekki@carebridge.local` | Owner, Lekki Smiles Dental (dentistry, endodontics) | Request queue → make an offer; My patients; Appointments |
| `owner.ikeja@carebridge.local` | Owner, Ikeja Dental Centre (dentistry, orthodontics) | A second clinic to compete for the same request |
| `operator@carebridge.local` | Operator | Overview, queue (offer on any clinic's behalf), journeys |
| `admin@carebridge.local` | Admin | Providers (add / verify / link staff), Users (approve sign-ups) |

## Walk through the whole journey

Use a normal window for one role and a private/incognito window (or another browser) for the other,
because each tab keeps its own sign-in.

1. **Patient** → *New request* → answer **No** to the emergency question → describe the problem → *Send request*.
   (Answer **Yes** once to see the emergency redirect — nothing is stored.)
2. **owner.lekki** → *Request queue* → *Make an offer* → add a message → *Send offer*.
3. **Patient** → open the request → *Choose* the offer → *Book appointment* (Lagos time).
   Book the same time again to see the double-booking protection.
4. **owner.lekki** → *My patients* → *Start assessment* → … ; *Appointments* → *Confirm* → *Check in* → *Complete*.
5. **Admin** → *Providers* → *Add provider* → *Verify*. Register a new clinic-staff account at `/register`
   (it waits for approval) → *Users* → *Approve* → *Providers* → *Staff* → link them. Sign in as them.
6. **Operator** → *Journeys* to see every patient's progress.

## Reset to a clean, seeded database

```powershell
cd apps/api
npm run migrate:down -- --steps 18   # roll everything back (also proves every down works)
npm run migrate
npm run seed
```

Docker-only setup: `docker compose down -v`, `docker compose up -d`, then seed again.

## Tests, lint, types

```powershell
cd apps/api
npm test              # 88 tests against real MySQL (uses DB_* from apps/api/.env; see step 2)
npm run lint; npm run typecheck; npm run format:check

cd ../web
npm test              # 25 tests (no database needed)
npm run lint; npm run typecheck; npm run build
```

The API tests always use `carebridge_test` / `carebridge_migrations_test`, whatever `DB_NAME` says, and refuse
any database name that doesn't end in `_test`.

## Everyday tasks

| Task | How |
|---|---|
| Add an endpoint | Schema → repo → service (permissions, `assertTransition`, `audit`) → route → tests (allowed + denied) → `docs/api.md` → web `api/endpoints.ts` + `types.ts` |
| Change the schema | `npm run migrate:new -- <name>` → [migrations.md](migrations.md) checklist |
| Add a status | `lib/stateMachine.ts` → migration for the ENUM → service → web `lib/labels.ts` |
| Add a page | `apps/web/src/features/<area>/<Name>Page.tsx` → route in `App.tsx` (inside `RequireRole`) → nav in `components/Layout.tsx` |

## Troubleshooting

| Problem | Fix |
|---|---|
| `Invalid environment configuration` when the API starts | `apps/api/.env`: `JWT_SECRET` must be ≥ 32 characters and `DB_PASSWORD` set. |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL isn't running, or it's on another port (`DB_PORT`). |
| `Access denied for user 'carebridge'` | Password in `apps/api/.env` doesn't match the database user. |
| Tests: `Access denied … to database 'carebridge_test'` | Run the GRANT in [step 2](#2-allow-the-tests-to-create-their-own-databases-once). |
| `npm install` warns `EBADENGINE` / tests won't start | Node is too old — install Node 22.22+ or 24 LTS. |
| Web says *Cannot reach CareBridge* | The API isn't running on :4000 (or set `VITE_API_PROXY`). |
| `migrated by the old migration runner` | Dev data only: drop and recreate the `carebridge` database, then `npm run migrate` and `npm run seed`. |
| Other migration errors | [migrations.md → Troubleshooting](migrations.md#troubleshooting). |
