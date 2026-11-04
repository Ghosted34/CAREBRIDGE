-- Add the 'operator' role for CareBridge coordinators who match requests by hand during the pilot.

-- migrate:up
ALTER TABLE users
  MODIFY role ENUM('patient','provider_staff','operator','admin') NOT NULL DEFAULT 'patient';

-- migrate:down
-- Fails if any operator accounts exist: reassign or delete them first.
ALTER TABLE users
  MODIFY role ENUM('patient','provider_staff','admin') NOT NULL DEFAULT 'patient';
