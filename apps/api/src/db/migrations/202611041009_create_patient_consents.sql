-- Versioned consent grants and revocations per patient.

-- migrate:up
CREATE TABLE patient_consents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_user_id BIGINT UNSIGNED NOT NULL,
  consent_type ENUM('terms','privacy','data_sharing','marketing') NOT NULL,
  version VARCHAR(30) NOT NULL,
  granted BOOLEAN NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  INDEX idx_patient_consents_patient (patient_user_id, consent_type),
  CONSTRAINT fk_patient_consents_patient FOREIGN KEY (patient_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
DROP TABLE patient_consents;
