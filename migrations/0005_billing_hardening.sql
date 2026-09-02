PRAGMA foreign_keys = ON;

ALTER TABLE subscriptions ADD COLUMN provider_plan_id TEXT
  CHECK(provider_plan_id IS NULL OR length(provider_plan_id) BETWEEN 1 AND 191);
ALTER TABLE subscriptions ADD COLUMN provider_status TEXT
  CHECK(provider_status IS NULL OR length(provider_status) BETWEEN 1 AND 80);
ALTER TABLE subscriptions ADD COLUMN provider_version INTEGER
  CHECK(provider_version IS NULL OR provider_version >= 0);
ALTER TABLE subscriptions ADD COLUMN last_provider_sync_at TEXT;

-- Checkout is deliberately represented on the subscription itself. One
-- authenticated user + idempotency key owns one immutable local subscription,
-- so concurrent browser retries cannot fan out into multiple provider contracts.
ALTER TABLE subscriptions ADD COLUMN checkout_idempotency_key TEXT
  CHECK(checkout_idempotency_key IS NULL OR length(checkout_idempotency_key) BETWEEN 8 AND 120);
ALTER TABLE subscriptions ADD COLUMN checkout_state TEXT
  CHECK(checkout_state IS NULL OR checkout_state IN ('running', 'created', 'failed'));
ALTER TABLE subscriptions ADD COLUMN checkout_lease_expires_at TEXT;
ALTER TABLE subscriptions ADD COLUMN checkout_url TEXT
  CHECK(checkout_url IS NULL OR length(checkout_url) <= 2048);
ALTER TABLE subscriptions ADD COLUMN checkout_error_code TEXT
  CHECK(checkout_error_code IS NULL OR length(checkout_error_code) <= 80);

-- Billing webhook processing uses a lease on the existing append/audit row.
-- A duplicate delivery while the first attempt is active cannot cross the
-- provider boundary twice, while a crash/failed attempt remains retryable.
ALTER TABLE billing_events ADD COLUMN processing_lease_expires_at TEXT;
ALTER TABLE billing_events ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0
  CHECK(attempt_count >= 0);

CREATE INDEX idx_subscriptions_provider_plan
  ON subscriptions(provider, provider_plan_id, status)
  WHERE provider_plan_id IS NOT NULL;
CREATE UNIQUE INDEX idx_subscriptions_checkout_user_key
  ON subscriptions(user_id, checkout_idempotency_key)
  WHERE checkout_idempotency_key IS NOT NULL;
CREATE INDEX idx_subscriptions_checkout_lease
  ON subscriptions(checkout_state, checkout_lease_expires_at)
  WHERE checkout_state = 'running';
CREATE INDEX idx_billing_events_processing_lease
  ON billing_events(status, processing_lease_expires_at)
  WHERE status = 'received';
