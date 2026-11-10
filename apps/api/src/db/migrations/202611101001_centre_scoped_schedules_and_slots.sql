-- Schedules and bookable slots belong to an operating centre, keeping provider_id
-- for provider-level lookups (all slots of a clinic across its centres).
--
-- The old unique indexes (provider_id, day_of_week) and (provider_id, start_time)
-- double as the child-side index for fk_provider_schedules_provider /
-- fk_provider_slots_provider. A replacement index on provider_id is added first so
-- MySQL allows dropping them (it refuses to drop an index needed by a FK constraint).

-- migrate:up
ALTER TABLE provider_schedules
  ADD COLUMN centre_id BIGINT UNSIGNED NOT NULL,
  ADD INDEX idx_provider_schedules_provider_id (provider_id),
  ADD CONSTRAINT uq_provider_schedules_centre_day UNIQUE (centre_id, day_of_week),
  ADD CONSTRAINT fk_provider_schedules_centre FOREIGN KEY (centre_id) REFERENCES provider_centres (id);

ALTER TABLE provider_schedules DROP INDEX uq_provider_schedules_day;

ALTER TABLE provider_slots
  ADD COLUMN centre_id BIGINT UNSIGNED NOT NULL,
  ADD INDEX idx_provider_slots_provider_id (provider_id),
  ADD CONSTRAINT uq_provider_slots_centre_time UNIQUE (centre_id, start_time),
  ADD CONSTRAINT fk_provider_slots_centre FOREIGN KEY (centre_id) REFERENCES provider_centres (id);

ALTER TABLE provider_slots DROP INDEX uq_provider_slots_time;

-- migrate:down
ALTER TABLE provider_slots
  DROP FOREIGN KEY fk_provider_slots_centre,
  DROP INDEX uq_provider_slots_centre_time,
  DROP INDEX idx_provider_slots_provider_id,
  ADD CONSTRAINT uq_provider_slots_time UNIQUE (provider_id, start_time),
  DROP COLUMN centre_id;

ALTER TABLE provider_schedules
  DROP FOREIGN KEY fk_provider_schedules_centre,
  DROP INDEX uq_provider_schedules_centre_day,
  DROP INDEX idx_provider_schedules_provider_id,
  ADD CONSTRAINT uq_provider_schedules_day UNIQUE (provider_id, day_of_week),
  DROP COLUMN centre_id;
