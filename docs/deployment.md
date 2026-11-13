# OnDiGoH Deployment — Single Origin (Web + API)

OnDiGoH deploys as a **single Node.js application**: the API (Express) serves
both the REST API under `/api/v1/*` and the built React web app for all other
routes. This works on cPanel (via "Setup Node.js App") or any Node host.

## Build

From the repository root, build everything (web + API) in one command:

```bash
cd apps/api && npm run build
```

This:
1. Builds the React web app (Vite) → `apps/api/dist/public/`
2. Compiles the TypeScript API → `apps/api/dist/`
3. Copies DB migrations → `apps/api/dist/db/migrations/`

The startup file is `dist/server.js`.

## Database migrations

Migrations live in `apps/api/src/db/migrations/` as numbered SQL files
(`YYYYMMDDHHmm_name.sql` with `-- migrate:up` and `-- migrate:down` sections).
They are tracked in a `schema_migrations` table so they only run once.

There are two ways to apply them, depending on your hosting:

### Option A: Auto-migrate on server startup (recommended for cPanel & single-container Docker)

Set `AUTO_MIGRATE=true` in your environment. On every API startup, `server.ts`
checks for pending migrations and applies them automatically before the server
starts listening. No terminal or CLI access is needed.

**cPanel:** Add `AUTO_MIGRATE=true` to the Node.js app environment variables in
cPanel's "Setup Node.js App" screen. When you create/restart the app, migrations
run automatically.

**Docker:** Add `AUTO_MIGRATE: "true"` to the API service environment in
`docker-compose.yml`. When the container starts, migrations run automatically.

### Option B: Run migrations via CLI (when you have terminal/SSH access)

```bash
cd apps/api
npm run migrate:prod      # apply pending migrations
npm run migrate:status    # show applied / pending
```

### Option C: Raw SQL via phpMyAdmin (cPanel, no CLI at all)

If you can't run Node scripts and don't want auto-migrate, each migration file
in `apps/api/src/db/migrations/` contains plain SQL. Open the file, copy the
`-- migrate:up` section, and run it in phpMyAdmin (or MySQL Workbench) against
your production database. Apply them in filename order.

You must also create the tracking table manually the first time:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(12) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  execution_ms INT NOT NULL
);
```

Then insert one row per applied migration with its version, name, and the SHA-256
checksum of its up section. (Auto-migrate handles all of this for you.)

## Docker single-deploy (API serves web + API)

Update `docker-compose.yml` to use the single origin:

```yaml
services:
  db:
    image: mysql:8.4
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: ${DB_NAME:-carebridge}
      MYSQL_USER: ${DB_USER:-carebridge}
      MYSQL_PASSWORD: ${DB_PASSWORD:?set DB_PASSWORD in .env}
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:?set MYSQL_ROOT_PASSWORD in .env}
    volumes:
      - mysql_data:/var/lib/mysql
    ports: ['127.0.0.1:3306:3306']
    healthcheck:
      test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost']
      interval: 10s
      timeout: 5s
      retries: 10

  api:
    build: ./apps/api
    restart: unless-stopped
    env_file: .env
    environment:
      DB_HOST: db
      AUTO_MIGRATE: "true"   # migrations run on container startup
    ports: ['4000:4000']
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ['CMD', 'wget', '-qO-', 'http://localhost:4000/health']
      interval: 10s
      timeout: 5s
      retries: 12

  worker:
    build: ./apps/api
    restart: unless-stopped
    env_file: .env
    environment:
      DB_HOST: db
    command: ['node', 'dist/worker.js']
    depends_on:
      api:
        condition: service_healthy

volumes:
  mysql_data:
```

Note: the separate `web` service is removed because the API now serves the
built React app directly. Build with:

```bash
docker-compose up --build -d
```

## cPanel deployment

### 1. Set up the Node.js app

In cPanel, go to **Software → Setup Node.js App**:

| Setting | Value |
|---------|-------|
| Application root | `/home/username/CAREBRIDGE/apps/api` (or your checkout path) |
| Application URL | `https://yourdomain.com` |
| Application startup file | `dist/server.js` |
| Node.js version | 22.12 or higher |
| Passenger environment | `production` |

Click **Create**.

### 2. Environment variables

Add these in the cPanel Node.js app environment variables:

```
NODE_ENV=production
PORT=3000          # or the port cPanel assigns
CORS_ORIGIN=https://yourdomain.com
DB_HOST=localhost
DB_PORT=3306
DB_NAME=carebridge
DB_USER=your_db_user
DB_PASSWORD=your_db_password
JWT_SECRET=a-long-random-secret-string-at-least-32-chars
AUTO_MIGRATE=true            # migrations apply automatically on app start
RUN_WORKER_IN_PROCESS=true   # send SMS/email from the app process (cPanel runs one process)
NOTIFY_SMS_PROVIDER=log      # termii once you have an account; see notifications.md
NOTIFY_EMAIL_PROVIDER=log    # smtp once configured
APP_URL=https://yourdomain.com
```

`RUN_WORKER_IN_PROCESS=true` runs the notification sender inside the web app, because Passenger
starts only one process and there is no separate worker. Leave it `false` where you run `npm run worker`
separately (Docker).

**MySQL or MariaDB.** cPanel hosts often provide MariaDB. The API avoids MySQL-only SQL
(`JSON_OVERLAPS`, `FOR UPDATE OF`) so it runs on MariaDB 10.6+ too; MySQL 8 is what CI tests against.

### 3. Build & deploy

Upload the built `dist/` folder (run `cd apps/api && npm run build` locally,
then upload `apps/api/dist/` to your app root), or build on the server if cPanel
gives you terminal access.

### 4. Migrations

With `AUTO_MIGRATE=true`, migrations run automatically when you create or restart
the app. No terminal needed.

If you prefer manual control, use Option B (CLI) or Option C (raw SQL via
phpMyAdmin) above.

### 5. First admin (production)

Sign-up offers patient and clinic accounts only, so create the first admin from the terminal (or the
cPanel "Run JS script" box) once the app is built. It is safe to re-run; it resets the password.

```bash
cd /home/username/CAREBRIDGE/apps/api
ADMIN_EMAIL=you@yourdomain.com ADMIN_NAME="Your Name" ADMIN_PHONE=+2348012345678 \
ADMIN_PASSWORD='a-long-password' npm run admin:create:prod
```

That admin verifies clinic sign-ups in the app (Providers → Verify), which also activates the clinic owner's
account; clinic owners add their centres,
opening hours, dentists and fees themselves.

### 6. Seed (optional, staging/demo only — refuses `NODE_ENV=production`)

If you have terminal access:

```bash
cd /home/username/CAREBRIDGE/apps/api
npm run seed
```

Default accounts:
- `admin@carebridge.local` / `CareBridge!2026`
- `operator@carebridge.local` / `CareBridge!2026`
- `patient@carebridge.local` / `CareBridge!2026`
- `owner.lekki@carebridge.local` / `CareBridge!2026`
- `owner.ikeja@carebridge.local` / `CareBridge!2026`
- `owner.abuja@carebridge.local` / `CareBridge!2026`
- `owner.yaba@carebridge.local` / `CareBridge!2026`

The seed is the end state of a staging run where everything was entered through the app (see the header
of `src/db/seed.ts`). It is re-runnable and updates an older seed in place. It seeds no bookings.

### 7. Restart

After any code change, restart the Node.js app in cPanel
(Software → Setup Node.js App → Restart). Migrations re-check on every restart
and only apply new ones.

## What the single origin means for the browser

| URL pattern | Handled by |
|-------------|------------|
| `/api/v1/*` | Express API (JSON) |
| `/health` | Express API (JSON) |
| Everything else (`/`, `/patient/new`, `/provider/fees`, etc.) | React web app (served as static `index.html` + client-side routing) |

## cPanel-specific notes

- cPanel runs Node.js apps under **Phusion Passenger**. The `dist/server.js` file is the Passenger entry point.
- The API binds to the port cPanel assigns via the `PORT` env var. `server.ts` reads `env.PORT`.
- `CORS_ORIGIN` should be set to your actual domain (e.g. `https://yourdomain.com`) so browsers allow the API calls.
- If cPanel puts the app in a subdirectory (not root domain), set Vite's `base` accordingly in `apps/web/vite.config.ts` and update `CORS_ORIGIN`.

## Rolling back

Since this is a single deployment, roll back by redeploying the previous Git commit:

```bash
git checkout <previous-commit>
cd apps/api && npm run build
# then restart the Node.js app in cPanel (or restart the Docker container)
```

To roll back a specific migration (only if you have CLI access):

```bash
cd apps/api
npm run migrate:down -- --yes --steps 1
```
