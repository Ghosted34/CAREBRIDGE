-- Record when a staff member was linked to a provider.

-- migrate:up
ALTER TABLE provider_users
  ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- migrate:down
ALTER TABLE provider_users DROP COLUMN created_at;
