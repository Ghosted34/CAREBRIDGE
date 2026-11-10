-- Consultation notes a provider adds to an appointment after the patient has been
-- seen: follow-up plan, referral for further diagnosis, prescriptions, or closing
-- the consultancy as a whole. Append-only: notes are never edited or deleted.

-- migrate:up
CREATE TABLE appointment_notes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id BIGINT UNSIGNED NOT NULL,
  note_type ENUM('follow_up', 'referral', 'prescription', 'consultation_closed') NOT NULL,
  notes TEXT NOT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_appointment_notes_appointment FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE CASCADE,
  CONSTRAINT fk_appointment_notes_author FOREIGN KEY (created_by_user_id) REFERENCES users (id),
  INDEX idx_appointment_notes_appointment (appointment_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
DROP TABLE appointment_notes;
