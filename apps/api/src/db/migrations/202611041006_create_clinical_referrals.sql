-- Clinician-to-clinician referrals (endpoints not built yet).

-- migrate:up
CREATE TABLE clinical_referrals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  care_request_id BIGINT UNSIGNED NOT NULL,
  referring_provider_id BIGINT UNSIGNED NOT NULL,
  receiving_provider_id BIGINT UNSIGNED NOT NULL,
  referred_specialty VARCHAR(100) NOT NULL,
  clinical_summary TEXT NOT NULL,
  status ENUM('draft','sent','accepted','declined','completed','cancelled') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_clinical_referrals_request (care_request_id),
  INDEX idx_clinical_referrals_receiving (receiving_provider_id, status),
  CONSTRAINT fk_clinical_referrals_request FOREIGN KEY (care_request_id) REFERENCES care_requests (id),
  CONSTRAINT fk_clinical_referrals_referring FOREIGN KEY (referring_provider_id) REFERENCES providers (id),
  CONSTRAINT fk_clinical_referrals_receiving FOREIGN KEY (receiving_provider_id) REFERENCES providers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
DROP TABLE clinical_referrals;
