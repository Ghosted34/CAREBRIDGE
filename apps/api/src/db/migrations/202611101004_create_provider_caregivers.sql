-- Caregivers (clinicians) who consult at a centre. A caregiver is a provider_staff
-- member of the provider, typically with the clinician role, linked to one centre.

-- migrate:up
CREATE TABLE provider_caregivers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_id BIGINT UNSIGNED NOT NULL,
  centre_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_provider_caregivers_centre_user UNIQUE (centre_id, user_id),
  CONSTRAINT fk_provider_caregivers_provider FOREIGN KEY (provider_id) REFERENCES providers (id),
  CONSTRAINT fk_provider_caregivers_centre FOREIGN KEY (centre_id) REFERENCES provider_centres (id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_caregivers_user FOREIGN KEY (user_id) REFERENCES users (id),
  INDEX idx_provider_caregivers_centre (centre_id),
  INDEX idx_provider_caregivers_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
DROP TABLE provider_caregivers;
