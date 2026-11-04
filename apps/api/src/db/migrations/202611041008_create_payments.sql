-- Payment records (gateway integration not built yet).

-- migrate:up
CREATE TABLE payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  care_request_id BIGINT UNSIGNED NOT NULL,
  payer_user_id BIGINT UNSIGNED NOT NULL,
  payee_provider_id BIGINT UNSIGNED NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  payment_provider VARCHAR(60) NULL,
  provider_reference VARCHAR(150) NULL,
  status ENUM('initiated','pending','successful','failed','refunded') NOT NULL DEFAULT 'initiated',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_payments_provider_reference UNIQUE (provider_reference),
  INDEX idx_payments_request (care_request_id),
  CONSTRAINT chk_payments_amount CHECK (amount >= 0),
  CONSTRAINT fk_payments_request FOREIGN KEY (care_request_id) REFERENCES care_requests (id),
  CONSTRAINT fk_payments_payer FOREIGN KEY (payer_user_id) REFERENCES users (id),
  CONSTRAINT fk_payments_payee_provider FOREIGN KEY (payee_provider_id) REFERENCES providers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
DROP TABLE payments;
