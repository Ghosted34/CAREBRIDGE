-- Structured, non-clinical context for audit entries (ids, from/to statuses).

-- migrate:up
ALTER TABLE audit_logs ADD COLUMN metadata JSON NULL AFTER ip_address;

-- migrate:down
ALTER TABLE audit_logs DROP COLUMN metadata;
