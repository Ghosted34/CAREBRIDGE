-- Fix provider_schedules unique constraint to include centre_id.
-- Previously unique on (provider_id, day_of_week) only, which prevented a
-- provider from having different operating hours for different centres on the
-- same day. Now unique on (provider_id, centre_id, day_of_week).

-- migrate:up
ALTER TABLE provider_schedules
  DROP INDEX uq_provider_schedules_day,
  ADD CONSTRAINT uq_provider_schedules_day UNIQUE (provider_id, centre_id, day_of_week);

-- migrate:down
ALTER TABLE provider_schedules
  DROP INDEX uq_provider_schedules_day,
  ADD CONSTRAINT uq_provider_schedules_day UNIQUE (provider_id, day_of_week);
