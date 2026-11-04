-- Speed up 'open offers for this request' lookups used when accepting/expiring offers.

-- migrate:up
CREATE INDEX idx_provider_offers_request_status ON provider_offers (care_request_id, status);

-- migrate:down
DROP INDEX idx_provider_offers_request_status ON provider_offers;
