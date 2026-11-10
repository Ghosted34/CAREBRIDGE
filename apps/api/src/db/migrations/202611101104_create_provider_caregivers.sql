-- Caregivers / clinicians working at a provider's centre.
-- Patients can optionally request a specific caregiver when booking.

-- migrate:up
CREATE TABLE provider_caregivers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_id BIGINT UNSIGNED NOT NULL,
  centre_id BIGINT UNSIGNED NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  role ENUM('dentist', 'caregiver', 'hygienist', 'specialist') NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_provider_caregivers_provider (provider_id),
  INDEX idx_provider_caregivers_centre (centre_id),
  CONSTRAINT fk_provider_caregivers_provider FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_caregivers_centre FOREIGN KEY (centre_id) REFERENCES provider_centres (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
DROP TABLE provider_caregivers;
