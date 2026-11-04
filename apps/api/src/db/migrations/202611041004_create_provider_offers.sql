-- A provider offering to take on a care request.

-- migrate:up
CREATE TABLE provider_offers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  care_request_id BIGINT UNSIGNED NOT NULL,
  provider_id BIGINT UNSIGNED NOT NULL,
  offered_by_user_id BIGINT UNSIGNED NOT NULL,
  message VARCHAR(1000) NULL,
  status ENUM('offered','accepted','declined','expired','withdrawn') NOT NULL DEFAULT 'offered',
  offered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at DATETIME NULL,
  CONSTRAINT uq_provider_offers_request_provider UNIQUE (care_request_id, provider_id),
  INDEX idx_provider_offers_provider (provider_id, status),
  CONSTRAINT fk_provider_offers_request FOREIGN KEY (care_request_id) REFERENCES care_requests (id),
  CONSTRAINT fk_provider_offers_provider FOREIGN KEY (provider_id) REFERENCES providers (id),
  CONSTRAINT fk_provider_offers_offered_by FOREIGN KEY (offered_by_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
DROP TABLE provider_offers;
