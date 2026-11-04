-- Scheduled consultations, diagnostics and procedures.

-- migrate:up
CREATE TABLE appointments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  care_request_id BIGINT UNSIGNED NOT NULL,
  patient_user_id BIGINT UNSIGNED NOT NULL,
  provider_id BIGINT UNSIGNED NOT NULL,
  appointment_type ENUM('assessment','specialist','diagnostic','procedure','follow_up') NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  status ENUM('booked','confirmed','checked_in','completed','cancelled','no_show') NOT NULL DEFAULT 'booked',
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_appointments_provider_time (provider_id, starts_at, ends_at, status),
  INDEX idx_appointments_patient (patient_user_id, starts_at),
  INDEX idx_appointments_request (care_request_id),
  CONSTRAINT chk_appointments_time_order CHECK (ends_at > starts_at),
  CONSTRAINT fk_appointments_request FOREIGN KEY (care_request_id) REFERENCES care_requests (id),
  CONSTRAINT fk_appointments_patient FOREIGN KEY (patient_user_id) REFERENCES users (id),
  CONSTRAINT fk_appointments_provider FOREIGN KEY (provider_id) REFERENCES providers (id),
  CONSTRAINT fk_appointments_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
DROP TABLE appointments;
