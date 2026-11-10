-- Every appointment happens at a specific operating centre and is either a
-- physical visit or a remote video/voice call.
--
-- centre_id is added nullable first: existing appointments for providers that
-- have no operating centre yet are not invalidated. Existing appointments are
-- backfilled to their provider's (oldest) centre where one exists; a later
-- migration can tighten centre_id to NOT NULL once every provider has a centre.

-- migrate:up
ALTER TABLE appointments
  ADD COLUMN centre_id BIGINT UNSIGNED NULL,
  ADD COLUMN appointment_mode ENUM('physical','video_call','voice_call') NOT NULL DEFAULT 'physical';

-- Backfill existing appointments to their provider's operating centre.
-- When a provider operates multiple centres, the oldest one is used.
UPDATE appointments a
JOIN (
  SELECT provider_id, MIN(id) AS centre_id
  FROM provider_centres
  GROUP BY provider_id
) c ON c.provider_id = a.provider_id
SET a.centre_id = c.centre_id
WHERE a.centre_id IS NULL;

ALTER TABLE appointments
  ADD CONSTRAINT fk_appointments_centre FOREIGN KEY (centre_id) REFERENCES provider_centres (id);

-- migrate:down
ALTER TABLE appointments
  DROP FOREIGN KEY fk_appointments_centre,
  DROP COLUMN appointment_mode,
  DROP COLUMN centre_id;
