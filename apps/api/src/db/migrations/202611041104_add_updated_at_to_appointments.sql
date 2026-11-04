-- Track when an appointment last changed status.

-- migrate:up
ALTER TABLE appointments
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- migrate:down
ALTER TABLE appointments DROP COLUMN updated_at;
