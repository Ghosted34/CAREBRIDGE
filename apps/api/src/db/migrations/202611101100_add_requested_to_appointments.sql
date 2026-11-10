-- Add `requested` appointment status for the simplified booking flow.
-- Patient sends a booking request; the appointment starts as `requested`,
-- the provider then confirms (-> confirmed) or declines (-> cancelled).

-- migrate:up
ALTER TABLE appointments
  MODIFY COLUMN status ENUM('requested','booked','confirmed','checked_in','completed','cancelled','no_show') NOT NULL DEFAULT 'booked';

-- migrate:down
ALTER TABLE appointments
  MODIFY COLUMN status ENUM('booked','confirmed','checked_in','completed','cancelled','no_show') NOT NULL DEFAULT 'booked';
