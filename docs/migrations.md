# Database migrations

The database schema is owned by migration files in `apps/api/src/db/migrations/`. The runner is
`apps/api/src/db/migrator.ts`; the CLI is `apps/api/src/db/migrate.ts`. All commands run in `apps/api`.

## The history so far

Tables are created first, one file per table, in foreign-key order (parents before children). Changes
to existing tables come after, one file per change.

| Version | File | What |
|---|---|---|
| 202611041000 | `create_users` | accounts |
| 202611041001 | `create_providers` | facilities |
| 202611041002 | `create_provider_users` | staff ↔ provider (FK users, providers) |
| 202611041003 | `create_care_requests` | requests (FK users, providers) |
| 202611041004 | `create_provider_offers` | offers (FK care_requests, providers, users) |
| 202611041005 | `create_appointments` | appointments (FK care_requests, users, providers) |
| 202611041006 | `create_clinical_referrals` | referrals |
| 202611041007 | `create_service_estimates` | estimates |
| 202611041008 | `create_payments` | payments |
| 202611041009 | `create_patient_consents` | consents |
| 202611041010 | `create_notifications` | notification queue |
| 202611041011 | `create_audit_logs` | audit trail |
| 202611041100 | `add_operator_role_to_users` | `users.role` gains `operator` |
| 202611041101 | `add_updated_at_to_providers` | |
| 202611041102 | `add_created_at_to_provider_users` | |
| 202611041103 | `add_request_status_index_to_provider_offers` | `idx_provider_offers_request_status` |
| 202611041104 | `add_updated_at_to_appointments` | |
| 202611041105 | `add_metadata_to_audit_logs` | `audit_logs.metadata` JSON |
| 202611041600 | `rename_patient_consents_to_user_consents` | staff accept terms too |
| 202611041601 | `rename_patient_user_id_in_user_consents` | column, index and FK renamed in one `ALTER` |
| 202611041602 | `add_context_to_user_consents` | `source`, `ip_address` |
| 202611041610 | `add_delivery_tracking_to_notifications` | retries, last error, read time, `skipped` status |
| 202611041611 | `add_inbox_index_to_notifications` | inbox + queue indexes (see the note in its down section) |

## Commands

```bash
npm run migrate                      # apply all pending migrations
npm run migrate:status               # list applied / pending, and any problems (exit 1 if problems)
npm run migrate:down                 # roll back the newest migration
npm run migrate:down -- --steps 3    # roll back the newest three
npm run migrate:new -- add_notes_to_appointments   # create a new, empty, timestamped file
npm run migrate:verify               # check every file's name/format, no database needed (CI runs this)
npm run migrate:prod                 # compiled runner (used by the Docker image on start)
```

Flags: `--allow-out-of-order` (up), `--steps N` and `--yes` (down; `--yes` is required when `NODE_ENV=production`).

## File format

```sql
-- One line on why this change is needed.

-- migrate:up
ALTER TABLE appointments ADD COLUMN notes VARCHAR(500) NULL AFTER status;

-- migrate:down
ALTER TABLE appointments DROP COLUMN notes;
```

- Name: `YYYYMMDDHHmm_snake_case_description.sql` (UTC). `migrate:new` generates it and guarantees it sorts last.
- Verbs in names: `create_<table>`, `add_<column>_to_<table>`, `drop_<column>_from_<table>`,
  `add_<index>_index_to_<table>`, `rename_<old>_to_<new>_in_<table>`, `backfill_<what>`.
- Both sections are required. The up section must not be empty. The down must exactly reverse the up.

## How the runner keeps you safe

| Check | What happens |
|---|---|
| **Checksum** | The SHA-256 of each applied up section is stored. If the file changes afterwards, `migrate` refuses: *"was changed after it was applied"*. CRLF vs LF doesn't count as a change. |
| **Missing file** | An applied migration whose file has gone → refuses. |
| **Out of order** | A pending file older than the newest applied one (typical after merging two branches) → refuses unless `--allow-out-of-order`. Usually: rename yours with a newer timestamp. |
| **Lock** | A MySQL named lock (`carebridge_migrations`) stops two runners (e.g. two API containers starting) from migrating at once. |
| **Recorded only on success** | A migration is written to `schema_migrations` only after every statement succeeds. |
| **Partial failure report** | MySQL DDL auto-commits, so a multi-statement migration can half-apply. The error names the failing statement (*"failed at statement 2/3… statements 1–1 already ran"*) so you know exactly what to fix. Keep one statement per file to avoid this. |
| **Production rollback guard** | `migrate:down` needs `--yes` when `NODE_ENV=production`. |
| **Old-runner detection** | A database migrated by the pre-2026-11-04 runner is detected and you're told to recreate it (it only ever held dev data). |

## Writing a migration — checklist

1. `npm run migrate:new -- <name>` and fill in both sections.
2. One logical change. Name every constraint/index you create (`fk_`, `uq_`, `idx_`, `chk_`).
3. New `NOT NULL` column on a table with data? Give it a `DEFAULT`, or add it nullable → backfill → make it
   `NOT NULL` in a later migration.
4. ENUM change? Adding a value at the end is cheap. Removing or renaming one needs a data migration first
   (update rows), and the down must say if it can fail.
5. Run it: `npm run migrate`, then `npm run migrate:down`, then `npm run migrate` again — the round trip must work.
6. Update `lib/stateMachine.ts` (status changes), `docs/data-model.md`, and the web `api/types.ts` if responses change.
7. `npm test` — `test/migrations.test.ts` does a full up → down → up on a scratch database.

## Changing live data safely (expand → migrate → contract)

For a rename or type change on a table that already holds pilot data:

1. **Expand:** add the new column (nullable). Deploy.
2. **Migrate:** deploy code that writes both columns; run a `backfill_…` migration (or script) for old rows.
3. **Switch:** deploy code that reads the new column only.
4. **Contract:** a later migration drops the old column (note in the file that its down cannot restore data).

Never combine expand and contract in one release.

## Troubleshooting

| Message | Fix |
|---|---|
| `…was changed after it was applied` | Revert your edit to that file (`git checkout` it) and put the change in a new migration. In local dev only, you may instead `migrate:down` past it, edit, and `migrate` again. |
| `…is older than the newest applied migration` | Rename your file with a newer timestamp (`migrate:new` makes one), or if intentional, run with `--allow-out-of-order`. |
| `…failed at statement N/M… already ran` | Inspect the schema (`SHOW CREATE TABLE …`), undo or finish the applied statements by hand, then rerun. Split the file into single-statement migrations. |
| Down fails with *needed in a foreign key constraint* when dropping an index | MySQL silently dropped the FK's automatic index once a new index covered the same leading column. Drop the FK, drop the index, re-add the FK (see `202611041611_add_inbox_index_to_notifications.sql`). |
| `Another migration run holds the lock` | Another container/terminal is migrating; wait. If a crashed session holds it, it's released when that MySQL connection closes. |
| `migrated by the old migration runner` | Dev data only: `DROP DATABASE carebridge; CREATE DATABASE carebridge;` then `npm run migrate` (and `npm run seed`). |
| `the up section is empty` | You ran `migrate:new` but didn't fill the file in. |

## Before running migrations against real data

- Take a backup (`mysqldump --single-transaction carebridge > backup.sql`) and confirm it restores.
- Run `npm run migrate:status` first and read the pending list.
- Test the same migrations against a copy of production data.
