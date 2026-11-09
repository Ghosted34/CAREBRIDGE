-- Record which adapter delivered each message and the provider's message id
-- (needed for delivery reports and support tickets with e.g. Termii).

-- migrate:up
ALTER TABLE notifications
  ADD COLUMN provider VARCHAR(40) NULL AFTER channel,
  ADD COLUMN provider_message_id VARCHAR(100) NULL AFTER provider;

-- migrate:down
ALTER TABLE notifications
  DROP COLUMN provider_message_id,
  DROP COLUMN provider;
