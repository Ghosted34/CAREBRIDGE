-- Post-visit notes: follow-up, referral, prescription, closing consultancy.
-- Added by the provider after the patient has been checked in.

-- migrate:up
CREATE TABLE appointment_notes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id BIGINT UNSIGNED NOT NULL,
  author_user_id BIGINT UNSIGNED NOT NULL,
  note_type ENUM('follow_up', 'referral', 'prescription', 'closing_consultancy') NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_appointment_notes_appointment (appointment_id),
  CONSTRAINT fk_appointment_notes_appointment FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE CASCADE,
  CONSTRAINT fk_appointment_notes_author FOREIGN KEY (author_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
DROP TABLE appointment_notes;
