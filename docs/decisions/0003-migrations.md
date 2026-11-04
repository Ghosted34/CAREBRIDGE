# 0003 — Migration strategy

- **Status:** accepted (supersedes point 7 of [0001](0001-foundation.md))
- **Date:** 2026-11-04

## Context
The first runner applied two files: the whole original schema in one file, then a batch of `ALTER`s. That
hid the history of each table, couldn't roll back, didn't notice edited files, and two API containers
starting together could both try to migrate. MySQL DDL auto-commits, so a long multi-statement file can
fail half-way with no rollback.

## Decision
1. **One table per create migration, in foreign-key order; then one change per update migration.**
2. **Timestamped versions** (`YYYYMMDDHHmm_name.sql`, UTC) to avoid number collisions between branches;
   `migrate:new` generates them and guarantees they sort last.
3. **Up and down in one file** (`-- migrate:up` / `-- migrate:down`), both required.
4. **Runner safety:** SHA-256 checksum per applied migration (line-ending independent), refuse missing or
   edited files, refuse out-of-order pending files unless explicitly allowed, MySQL named lock, record a
   migration only after all statements succeed, precise partial-failure messages, `--yes` required to roll
   back in production, detection of databases from the old runner.
5. **Named constraints and indexes** everywhere so later migrations can alter them.
6. **Expand → migrate → contract** for changes to tables that hold live data.
7. **Tests:** a full up → down → up round trip and every safety rule are covered by `test/migrations.test.ts`;
   CI also runs `migrate:verify`.

## Consequences
- The two earlier files were replaced. That's safe only because no shared environment had run them; any
  local database migrated by the old runner is detected and must be recreated (dev data only).
- From now on, applied migrations are immutable.
- No ORM / schema DSL: migrations are plain MySQL, reviewed like code.
