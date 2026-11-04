-- Which staff users belong to which provider, and in what role.

-- migrate:up
CREATE TABLE provider_users (
  provider_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  provider_role ENUM('owner','clinician','scheduler','receptionist') NOT NULL,
  PRIMARY KEY (provider_id, user_id),
  INDEX idx_provider_users_user (user_id),
  CONSTRAINT fk_provider_users_provider FOREIGN KEY (provider_id) REFERENCES providers (id),
  CONSTRAINT fk_provider_users_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
DROP TABLE provider_users;
