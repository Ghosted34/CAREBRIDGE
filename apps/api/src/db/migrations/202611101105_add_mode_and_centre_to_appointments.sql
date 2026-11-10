-- Booking mode (physical or remote video/voice) and the centre the visit happens at.

-- migrate:up
ALTER TABLE appointments
  ADD COLUMN appointment_mode ENUM('physical', 'remote') NOT NULL DEFAULT 'physical',
  ADD COLUMN centre_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_appointments_centre FOREIGN KEY (centre_id) REFERENCES provider_centres (id) ON DELETE SET NULL,
  ADD INDEX idx_appointments_centre (centre_id);

-- migrate:down
ALTER TABLE appointments
  DROP FOREIGN KEY fk_appointments_centre,
  DROP INDEX idx_appointments_centre,
  DROP COLUMN appointment_mode,
  DROP COLUMN centre_id;
