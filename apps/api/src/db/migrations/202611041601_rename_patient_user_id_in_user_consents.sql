-- Follow-up to the table rename: the owner column, its index and its FK get user_* names.
-- One ALTER statement, so it applies (or fails) as a whole.

-- migrate:up
ALTER TABLE user_consents
  DROP FOREIGN KEY fk_patient_consents_patient,
  RENAME COLUMN patient_user_id TO user_id,
  RENAME INDEX idx_patient_consents_patient TO idx_user_consents_user,
  ADD CONSTRAINT fk_user_consents_user FOREIGN KEY (user_id) REFERENCES users (id);

-- migrate:down
ALTER TABLE user_consents
  DROP FOREIGN KEY fk_user_consents_user,
  RENAME COLUMN user_id TO patient_user_id,
  RENAME INDEX idx_user_consents_user TO idx_patient_consents_patient,
  ADD CONSTRAINT fk_patient_consents_patient FOREIGN KEY (patient_user_id) REFERENCES users (id);
