-- Provider bookable appointment slots.

-- migrate:up
CREATE TABLE provider_slots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_id BIGINT UNSIGNED NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  status ENUM('available','held','booked','cancelled') NOT NULL DEFAULT 'available',
  appointment_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_provider_slots_time UNIQUE (provider_id, start_time),
  CONSTRAINT chk_provider_slots_time_order CHECK (end_time > start_time),
  INDEX idx_provider_slots_provider_status_time (provider_id, status, start_time),
  CONSTRAINT fk_provider_slots_provider FOREIGN KEY (provider_id) REFERENCES providers (id),
  CONSTRAINT fk_provider_slots_appointment FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
DROP TABLE provider_slots;
