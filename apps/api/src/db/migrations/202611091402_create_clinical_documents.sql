-- Secure clinical document metadata (photos, X-rays, reports). Files live in encrypted object storage.

-- migrate:up
CREATE TABLE clinical_documents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  care_request_id BIGINT UNSIGNED NOT NULL,
  uploader_user_id BIGINT UNSIGNED NOT NULL,
  document_type ENUM('photo','xray','report','referral','other') NOT NULL DEFAULT 'photo',
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes BIGINT UNSIGNED NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_clinical_documents_request (care_request_id),
  CONSTRAINT chk_clinical_documents_size CHECK (file_size_bytes > 0),
  CONSTRAINT fk_clinical_documents_request FOREIGN KEY (care_request_id) REFERENCES care_requests (id),
  CONSTRAINT fk_clinical_documents_uploader FOREIGN KEY (uploader_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
DROP TABLE clinical_documents;
