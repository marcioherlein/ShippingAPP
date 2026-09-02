PRAGMA foreign_keys = ON;

ALTER TABLE subscriptions ADD COLUMN provider_plan_id TEXT
  CHECK(provider_plan_id IS NULL OR length(provider_plan_id) BETWEEN 1 AND 191);
ALTER TABLE subscriptions ADD COLUMN provider_status TEXT
  CHECK(provider_status IS NULL OR length(provider_status) BETWEEN 1 AND 80);
ALTER TABLE subscriptions ADD COLUMN provider_version INTEGER
  CHECK(provider_version IS NULL OR provider_version >= 0);
ALTER TABLE subscriptions ADD COLUMN last_provider_sync_at TEXT;

CREATE INDEX idx_subscriptions_provider_plan
  ON subscriptions(provider, provider_plan_id, status)
  WHERE provider_plan_id IS NOT NULL;

CREATE TABLE billing_checkout_attempts (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 64),
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(length(provider) BETWEEN 1 AND 40),
  provider_plan_id TEXT NOT NULL CHECK(length(provider_plan_id) BETWEEN 1 AND 191),
  idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 120),
  status TEXT NOT NULL CHECK(status IN ('running', 'created', 'failed')),
  lease_expires_at TEXT NOT NULL CHECK(length(lease_expires_at) BETWEEN 20 AND 35),
  checkout_url TEXT CHECK(checkout_url IS NULL OR length(checkout_url) <= 2048),
  error_code TEXT CHECK(error_code IS NULL OR length(error_code) <= 80),
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 20 AND 35),
  updated_at TEXT NOT NULL CHECK(length(updated_at) BETWEEN 20 AND 35),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(plan_id) REFERENCES plans(id) ON DELETE RESTRICT,
  FOREIGN KEY(subscription_id, user_id) REFERENCES subscriptions(id, user_id) ON DELETE CASCADE,
  UNIQUE(user_id, idempotency_key),
  UNIQUE(subscription_id)
);

CREATE INDEX idx_billing_checkout_user_status
  ON billing_checkout_attempts(user_id, status, created_at DESC);
CREATE INDEX idx_billing_checkout_lease
  ON billing_checkout_attempts(status, lease_expires_at);
