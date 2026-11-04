-- Outbound notification queue (senders not built yet).

-- migrate:up
CREATE TABLE notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  channel ENUM('in_app','email','sms','push') NOT NULL,
  template_key VARCHAR(100) NOT NULL,
  payload JSON NULL,
  status ENUM('queued','sent','failed') NOT NULL DEFAULT 'queued',
  sent_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_status (status, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
DROP TABLE notifications;
