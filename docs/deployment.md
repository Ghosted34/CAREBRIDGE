# Deployment

The pilot runs as three containers from `docker-compose.yml`:

| Service | Image | Port | Notes |
|---|---|---|---|
| `db` | `mysql:8.4` | 127.0.0.1:3306 | data in the `mysql_data` volume |
| `api` | built from `apps/api/Dockerfile` | 4000 | runs `migrate up` then the server on every start |
| `web` | built from `apps/web/Dockerfile` (nginx) | 3000 → 80 | serves the SPA, proxies `/api` + `/health` to `api` |

Put a TLS-terminating reverse proxy (or load balancer) in front of `web` and expose only 443. The API
trusts one proxy hop (`trust proxy = 1`) for client IPs in audit logs and rate limits.

## Environment variables

Set in the root `.env` (read by Compose). The API validates them at start-up and refuses to run if invalid.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | | `development` | `production` on servers |
| `PORT` | | `4000` | API port |
| `JWT_SECRET` | ✅ | — | ≥ 32 random chars. Rotating it signs everyone out |
| `JWT_EXPIRES_IN` | | `8h` | token lifetime |
| `DB_HOST` | | `127.0.0.1` | Compose overrides to `db` |
| `DB_PORT` | | `3306` | |
| `DB_NAME` | | `carebridge` | |
| `DB_USER` | | `carebridge` | |
| `DB_PASSWORD` | ✅ | — | |
| `MYSQL_ROOT_PASSWORD` | ✅ (Compose) | — | MySQL container root password |
| `CORS_ORIGIN` | | `http://localhost:3000` | only matters if a browser calls the API directly (not via nginx) |
| `LOG_LEVEL` | | `info` | `fatal…trace`, `silent` |
| `BCRYPT_ROUNDS` | | `12` | password hashing cost |
| `SEED_PASSWORD` | | `CareBridge!2026` | dev seed only |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

## Deploying a new version

```bash
git pull
docker compose build
mysqldump … > backup-$(date +%F).sql          # always, before migrations run
docker compose up -d                            # api runs pending migrations on start
docker compose logs -f api                      # look for "[migrate] done" / "already up to date"
```

If the API container keeps restarting, check its logs: a refused migration (edited file, out of order,
partial failure) stops start-up on purpose. See [migrations.md](migrations.md#troubleshooting).

**Rolling back code** that added migrations: roll back the migrations first
(`docker compose exec api node dist/db/migrate.js down --steps N --yes`) *only if* their down sections are
safe for the data now in the tables; otherwise restore from the backup.

## Backups

- Nightly `mysqldump --single-transaction --routines carebridge` to encrypted off-site storage.
- Keep at least 30 days; test a restore monthly.
- The `mysql_data` volume is not a backup.

## Launch checklist (before real patient data)

- [ ] TLS everywhere; HSTS at the edge proxy.
- [ ] Strong, unique `JWT_SECRET`, DB and root passwords; `.env` readable only by the deploy user.
- [ ] `NODE_ENV=production`; no seed data in the production database.
- [ ] Backups running and a restore tested.
- [ ] Monitoring on `/health`, container restarts, disk space, MySQL.
- [ ] Log shipping with retention rules (logs already redact tokens, passwords and clinical text).
- [ ] Emergency guidance text approved by clinical governance.
- [ ] Items in [security.md → Before launch](security.md#before-launch) closed or explicitly accepted.
- [ ] Legal/privacy review (NDPA 2023) and provider agreements signed.
