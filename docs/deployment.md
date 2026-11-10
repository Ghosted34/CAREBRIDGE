# CareLynk Deployment — Single Origin (Web + API)

CareLynk deploys as a **single Node.js application**: the API (Express) serves
both the REST API under `/api/v1/*` and the built React web app for all other
routes. This works on cPanel (via "Setup Node.js App") or any Node.js host.

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

## cPanel Deployment

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
PORT=3000 (or the port cPanel assigns)
CORS_ORIGIN=https://yourdomain.com
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_db_user
DB_PASS=your_db_password
DB_NAME=carelynk
JWT_SECRET=a-long-random-secret-string
```

### 3. Run migrations

In cPanel's **Terminal** (or via SSH), run:

```bash
cd /home/username/CAREBRIDGE/apps/api
npm run migrate:prod
```

This applies all pending migrations to the production database.

### 4. Seed (optional, for staging/demo)

```bash
npm run seed
```

This creates the default accounts:
- `admin@carebridge.local` / `CareBridge!2026`
- `operator@carebridge.local` / `CareBridge!2026`
- `patient@carebridge.local` / `CareBridge!2026`
- `owner.lekki@carebridge.local` / `CareBridge!2026`
- `owner.ikeja@carebridge.local` / `CareBridge!2026`

### 5. Restart

After any code change, restart the Node.js app in cPanel (Software → Setup Node.js App → Restart).

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
# then restart the Node.js app in cPanel
```
