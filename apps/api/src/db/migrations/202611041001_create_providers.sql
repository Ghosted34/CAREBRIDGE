-- Clinics, hospitals, specialists and diagnostic centres.

-- migrate:up
CREATE TABLE providers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  legal_name VARCHAR(190) NOT NULL,
  display_name VARCHAR(190) NOT NULL,
  provider_type ENUM('clinic','hospital','specialist','diagnostic_centre') NOT NULL,
  registration_number VARCHAR(100) NOT NULL,
  verification_status ENUM('pending','verified','rejected','suspended') NOT NULL DEFAULT 'pending',
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  city VARCHAR(100) NOT NULL,
  address VARCHAR(255) NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  specialties JSON NOT NULL,
  services JSON NULL,
  accepting_referrals BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_providers_registration_number UNIQUE (registration_number),
  INDEX idx_providers_search (city, verification_status, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
DROP TABLE providers;
