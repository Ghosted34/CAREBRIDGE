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
npm run seed                     # demo accounts + three clinics (Ikeja, Lekki/VI, Abuja)
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

The seed is the end state of a staging run on an empty database where everything was entered **through the
app** (sign-ups, admin approval, centres, hours, dentists, fees). `npm run seed` is re-runnable: it updates
existing rows (including those an older seed made) instead of duplicating them, seeds no bookings, and refuses to
run when `NODE_ENV=production`. Every account uses the password **`CareBridge!2026`** (`SEED_PASSWORD` to change).

| Email | Role | What's there |
|---|---|---|
| `patient@carebridge.local` | Patient, Ada Okafor, lives in **Ikeja** | Book a visit → search → book |
| `owner.ikeja@carebridge.local` | Owner, Ikeja Dental Centre (dentistry, orthodontics) | Centre *Allen Avenue*, Ikeja; Mon–Fri 08:00–18:00, Sat 10:00–14:00; ₦12,000 |
| `owner.lekki@carebridge.local` | Owner, Lekki Smiles Dental (dentistry, endodontics) | Centres *Lekki Phase 1* (₦15,000) and *Victoria Island* (₦20,000, own fee) |
| `owner.abuja@carebridge.local` | Owner, Capital Dental Clinic (dentistry, periodontics) | Centre *Wuse 2*, FCT — shows as "Further away" for a Lagos patient |
| `owner.yaba@carebridge.local` | Owner, Yaba Dental (dentistry) | Signed itself up; centre *Herbert Macaulay*, Yaba, weekdays 09:00–17:00; no dentists or fee yet |
| `operator@carebridge.local` | Operator | Overview; *Needs attention* (unconfirmed bookings, missing outcomes) |
| `admin@carebridge.local` | Admin | Providers (verify), Users (approve sign-ups) |

## Walk through the whole flow

Use a normal window for one role and a private/incognito window for the other (each tab keeps its own sign-in).

1. **Patient** → *Book a visit* → pick *Toothache or pain* → keep the default dates → *Find clinics*.
   Ikeja comes first ("In your area"), then Lekki/VI ("Same state"), then Abuja.
2. Pick a time → choose in person or video/voice → answer **No** to the emergency question → *Send booking
   request*. (Answer **Yes** once to see the emergency redirect — nothing is stored.)
3. **owner.ikeja** → *Bookings* → *To confirm* → *Confirm* → *Check in*. The notes form opens.
4. Add a *Prescription* note, then *Book a follow-up* (it starts confirmed), then a *Close visit* note.
5. **Patient** → *My visits* → open the visit: appointments, statuses and the clinic's notes.
6. **owner.lekki** → *Centres & hours*: change opening hours or add a dentist; search again as the patient.
7. **Operator** → *Needs attention* lists bookings left unconfirmed, not checked in, or with no notes.

To start from nothing instead: an empty database, `npm run admin:create` for the first admin, then register
clinics and patients at `/register`.

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
