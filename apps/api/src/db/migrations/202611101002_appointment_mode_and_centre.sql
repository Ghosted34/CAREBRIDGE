-- Every appointment happens at a specific operating centre and is either a
-- physical visit or a remote video/voice call.

-- migrate:up
ALTER TABLE appointments
  ADD COLUMN centre_id BIGINT UNSIGNED NOT NULL,
  ADD COLUMN appointment_mode ENUM('physical', 'video_call', 'voice_call') NOT NULL DEFAULT 'physical',
  ADD CONSTRAINT fk_appointments_centre FOREIGN KEY (centre_id) REFERENCES provider_centres (id);

-- migrate:down
ALTER TABLE appointments
  DROP FOREIGN KEY fk_appointments_centre,
  DROP COLUMN appointment_mode,
  DROP COLUMN centre_id;
