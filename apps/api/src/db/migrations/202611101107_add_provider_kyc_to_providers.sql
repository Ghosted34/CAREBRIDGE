-- Provider KYC: CAC number and tax ID, verified manually by platform admin.

-- migrate:up
ALTER TABLE providers
  ADD COLUMN cac_number VARCHAR(100) NULL,
  ADD COLUMN tax_id VARCHAR(100) NULL,
  ADD INDEX idx_providers_cac (cac_number),
  ADD INDEX idx_providers_tax (tax_id);

-- migrate:down
ALTER TABLE providers
  DROP COLUMN cac_number,
  DROP COLUMN tax_id;
