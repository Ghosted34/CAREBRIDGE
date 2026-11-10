-- Customizable fee types per provider/centre (consultancy, treatment, late_change, ...).

-- migrate:up
CREATE TABLE provider_fees (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_id BIGINT UNSIGNED NOT NULL,
  centre_id BIGINT UNSIGNED NULL,
  fee_type ENUM('consultancy', 'treatment', 'late_change', 'rescheduling', 'no_show', 'other') NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_provider_fees_provider (provider_id),
  INDEX idx_provider_fees_centre (centre_id),
  CONSTRAINT uq_provider_fees_type_centre UNIQUE (provider_id, centre_id, fee_type),
  CONSTRAINT fk_provider_fees_provider FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_fees_centre FOREIGN KEY (centre_id) REFERENCES provider_centres (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
DROP TABLE provider_fees;
