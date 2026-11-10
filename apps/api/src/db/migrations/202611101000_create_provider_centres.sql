-- Operating centres (branches) of a provider. A clinic or hospital can run several
-- locations, each with its own address and bookable capacity; a provider is
-- invisible publicly until verified, so centres of a pending facility are not listed.

-- migrate:up
CREATE TABLE provider_centres (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(190) NOT NULL COMMENT 'Branch name, e.g. "Lekki Phase 1"',
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  phone VARCHAR(50) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_provider_centres_name UNIQUE (provider_id, name),
  CONSTRAINT fk_provider_centres_provider FOREIGN KEY (provider_id) REFERENCES providers (id),
  INDEX idx_provider_centres_provider (provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
DROP TABLE provider_centres;
