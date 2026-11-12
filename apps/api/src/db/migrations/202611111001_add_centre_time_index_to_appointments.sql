-- Capacity is one appointment at a time per centre: free-time search and booking look up a centre's
-- active appointments by time, so index exactly that.

-- migrate:up
CREATE INDEX idx_appointments_centre_time ON appointments (centre_id, starts_at, ends_at, status);

-- migrate:down
DROP INDEX idx_appointments_centre_time ON appointments;
