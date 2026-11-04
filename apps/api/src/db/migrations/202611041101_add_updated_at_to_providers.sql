-- Track when a provider record last changed (e.g. verification).

-- migrate:up
ALTER TABLE providers
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- migrate:down
ALTER TABLE providers DROP COLUMN updated_at;
