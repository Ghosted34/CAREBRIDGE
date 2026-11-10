-- Customizable price per slot (staff set the price when creating a slot).

-- migrate:up
ALTER TABLE provider_slots
  ADD COLUMN price DECIMAL(14,2) NULL,
  ADD COLUMN currency CHAR(3) NOT NULL DEFAULT 'NGN',
  ADD INDEX idx_provider_slots_price (price);

-- migrate:down
ALTER TABLE provider_slots
  DROP COLUMN price,
  DROP COLUMN currency;
