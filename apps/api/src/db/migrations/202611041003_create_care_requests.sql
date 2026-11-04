-- A patient's request for care: the start of every journey.

-- migrate:up
CREATE TABLE care_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_user_id BIGINT UNSIGNED NOT NULL,
  specialty VARCHAR(100) NOT NULL,
  service_type VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  preferred_city VARCHAR(100) NOT NULL DEFAULT 'Lagos',
  urgency ENUM('routine','soon','urgent') NOT NULL DEFAULT 'routine',
  status ENUM('submitted','matching','provider_accepted','assessment','treatment_planned','in_progress','completed','cancelled') NOT NULL DEFAULT 'submitted',
  assigned_provider_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_care_requests_queue (status, urgency, created_at),
  INDEX idx_care_requests_patient (patient_user_id, created_at),
  INDEX idx_care_requests_assigned (assigned_provider_id, status),
  CONSTRAINT fk_care_requests_patient FOREIGN KEY (patient_user_id) REFERENCES users (id),
  CONSTRAINT fk_care_requests_assigned_provider FOREIGN KEY (assigned_provider_id) REFERENCES providers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
DROP TABLE care_requests;
