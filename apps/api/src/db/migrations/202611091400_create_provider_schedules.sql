-- Provider weekly schedule / opening hours for capacity management.

-- migrate:up
CREATE TABLE provider_schedules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_id BIGINT UNSIGNED NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL COMMENT '0=Sunday, 1=Monday ... 6=Saturday',
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  slot_duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_provider_schedules_day UNIQUE (provider_id, day_of_week),
  CONSTRAINT chk_provider_schedules_day CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT chk_provider_schedules_time CHECK (close_time > open_time),
  CONSTRAINT fk_provider_schedules_provider FOREIGN KEY (provider_id) REFERENCES providers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
DROP TABLE provider_schedules;
