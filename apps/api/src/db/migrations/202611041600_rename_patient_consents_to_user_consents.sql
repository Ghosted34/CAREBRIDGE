-- Consents apply to every account (patients and provider staff accept terms/privacy), not only patients.

-- migrate:up
RENAME TABLE patient_consents TO user_consents;

-- migrate:down
RENAME TABLE user_consents TO patient_consents;
