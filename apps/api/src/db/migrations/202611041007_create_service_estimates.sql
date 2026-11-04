-- Estimated charges a provider issues for a request (endpoints not built yet).

-- migrate:up
CREATE TABLE service_estimates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  care_request_id BIGINT UNSIGNED NOT NULL,
  provider_id BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  amount DECIMAL(14,2) NOT NULL,
  inclusions TEXT NULL,
  exclusions TEXT NULL,
  valid_until DATETIME NULL,
  status ENUM('draft','issued','accepted','rejected','expired') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_service_estimates_request (care_request_id),
  CONSTRAINT chk_service_estimates_amount CHECK (amount >= 0),
  CONSTRAINT fk_service_estimates_request FOREIGN KEY (care_request_id) REFERENCES care_requests (id),
  CONSTRAINT fk_service_estimates_provider FOREIGN KEY (provider_id) REFERENCES providers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
DROP TABLE service_estimates;
