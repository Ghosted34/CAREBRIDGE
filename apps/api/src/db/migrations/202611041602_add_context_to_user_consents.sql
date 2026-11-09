-- Record where and from which IP a consent decision was made (evidence for NDPA accountability).

-- migrate:up
ALTER TABLE user_consents
  ADD COLUMN source ENUM('registration','settings','request_form') NOT NULL DEFAULT 'settings' AFTER granted,
  ADD COLUMN ip_address VARCHAR(45) NULL AFTER source;

-- migrate:down
ALTER TABLE user_consents
  DROP COLUMN ip_address,
  DROP COLUMN source;
