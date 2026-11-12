-- The dentist/caregiver the patient asked for (optional). Previously sent by the web app but never stored.

-- migrate:up
ALTER TABLE appointments
  ADD COLUMN caregiver_id BIGINT UNSIGNED NULL AFTER centre_id,
  ADD CONSTRAINT fk_appointments_caregiver FOREIGN KEY (caregiver_id) REFERENCES provider_caregivers (id) ON DELETE SET NULL;

-- migrate:down
ALTER TABLE appointments
  DROP FOREIGN KEY fk_appointments_caregiver,
  DROP COLUMN caregiver_id;
