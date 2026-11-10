-- Patient KYC: structured address (single changeable address used for provider matching),
-- date of birth, gender, ID number, emergency contact.

-- migrate:up
ALTER TABLE users
  ADD COLUMN address_street VARCHAR(255) NULL,
  ADD COLUMN address_city VARCHAR(100) NULL,
  ADD COLUMN address_state VARCHAR(100) NULL,
  ADD COLUMN address_postal VARCHAR(20) NULL,
  ADD COLUMN date_of_birth DATE NULL,
  ADD COLUMN gender ENUM('male', 'female', 'other', 'prefer_not_to_say') NULL,
  ADD COLUMN id_number VARCHAR(50) NULL,
  ADD COLUMN emergency_contact_name VARCHAR(160) NULL,
  ADD COLUMN emergency_contact_phone VARCHAR(30) NULL;

-- migrate:down
ALTER TABLE users
  DROP COLUMN address_street,
  DROP COLUMN address_city,
  DROP COLUMN address_state,
  DROP COLUMN address_postal,
  DROP COLUMN date_of_birth,
  DROP COLUMN gender,
  DROP COLUMN id_number,
  DROP COLUMN emergency_contact_name,
  DROP COLUMN emergency_contact_phone;
