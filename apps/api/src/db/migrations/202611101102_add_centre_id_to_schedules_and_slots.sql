-- Scope schedules and slots to an operating centre.
-- A provider's opening hours and bookable slots belong to a specific centre.

-- migrate:up
ALTER TABLE provider_schedules
  ADD COLUMN centre_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_provider_schedules_centre FOREIGN KEY (centre_id) REFERENCES provider_centres (id) ON DELETE CASCADE,
  ADD INDEX idx_provider_schedules_centre (centre_id);

ALTER TABLE provider_slots
  ADD COLUMN centre_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_provider_slots_centre FOREIGN KEY (centre_id) REFERENCES provider_centres (id) ON DELETE CASCADE,
  ADD INDEX idx_provider_slots_centre (centre_id);

-- migrate:down
ALTER TABLE provider_slots
  DROP FOREIGN KEY fk_provider_slots_centre,
  DROP INDEX idx_provider_slots_centre,
  DROP COLUMN centre_id;

ALTER TABLE provider_schedules
  DROP FOREIGN KEY fk_provider_schedules_centre,
  DROP INDEX idx_provider_schedules_centre,
  DROP COLUMN centre_id;
