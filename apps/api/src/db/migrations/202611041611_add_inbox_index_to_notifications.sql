-- The in-app inbox lists a user's notifications newest first; the worker scans queued rows by retry time.

-- migrate:up
ALTER TABLE notifications
  ADD INDEX idx_notifications_inbox (user_id, channel, id),
  ADD INDEX idx_notifications_queue (status, next_attempt_at, id);

-- migrate:down
-- Once idx_notifications_inbox (starting with user_id) exists, MySQL may drop the automatic index it made
-- for fk_notifications_user, so the inbox index can't be dropped while the FK exists. Drop the FK, drop the
-- indexes, then re-add the FK (MySQL recreates its index). Two statements: if the second fails, re-run it.
ALTER TABLE notifications
  DROP FOREIGN KEY fk_notifications_user,
  DROP INDEX idx_notifications_queue,
  DROP INDEX idx_notifications_inbox;
ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id);
