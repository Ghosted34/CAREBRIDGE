-- Let the notification worker retry with backoff, record why delivery failed, and track in-app reads.
-- 'skipped' = nothing to send to (e.g. channel switched off, no address on file).

-- migrate:up
ALTER TABLE notifications
  MODIFY status ENUM('queued','sent','failed','skipped') NOT NULL DEFAULT 'queued',
  ADD COLUMN attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN next_attempt_at DATETIME NULL AFTER attempts,
  ADD COLUMN last_error VARCHAR(500) NULL AFTER next_attempt_at,
  ADD COLUMN read_at DATETIME NULL AFTER sent_at;

-- migrate:down
-- Fails if any rows are 'skipped': update them to 'failed' first.
ALTER TABLE notifications
  DROP COLUMN read_at,
  DROP COLUMN last_error,
  DROP COLUMN next_attempt_at,
  DROP COLUMN attempts,
  MODIFY status ENUM('queued','sent','failed') NOT NULL DEFAULT 'queued';
