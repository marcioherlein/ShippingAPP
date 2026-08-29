PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 64),
  auth_provider TEXT NOT NULL CHECK(length(auth_provider) BETWEEN 1 AND 40),
  auth_subject TEXT NOT NULL CHECK(length(auth_subject) BETWEEN 1 AND 191),
  email TEXT CHECK(email IS NULL OR length(email) <= 320),
  display_name TEXT CHECK(display_name IS NULL OR length(display_name) <= 120),
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 20 AND 35),
  updated_at TEXT NOT NULL CHECK(length(updated_at) BETWEEN 20 AND 35),
  UNIQUE(auth_provider, auth_subject)
);

CREATE INDEX idx_users_email ON users(email);

CREATE TABLE plans (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 64),
  code TEXT NOT NULL UNIQUE CHECK(length(code) BETWEEN 1 AND 40),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  monthly_credits INTEGER NOT NULL DEFAULT 0 CHECK(monthly_credits >= 0),
  monitoring_enabled INTEGER NOT NULL DEFAULT 0 CHECK(monitoring_enabled IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 20 AND 35),
  updated_at TEXT NOT NULL CHECK(length(updated_at) BETWEEN 20 AND 35)
);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 64),
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(length(provider) BETWEEN 1 AND 40),
  provider_customer_id TEXT CHECK(provider_customer_id IS NULL OR length(provider_customer_id) <= 191),
  provider_subscription_id TEXT CHECK(provider_subscription_id IS NULL OR length(provider_subscription_id) <= 191),
  status TEXT NOT NULL CHECK(status IN ('pending', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'expired')),
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK(cancel_at_period_end IN (0, 1)),
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 20 AND 35),
  updated_at TEXT NOT NULL CHECK(length(updated_at) BETWEEN 20 AND 35),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(plan_id) REFERENCES plans(id) ON DELETE RESTRICT,
  UNIQUE(id, user_id)
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id, status);
CREATE UNIQUE INDEX idx_subscriptions_provider_id
  ON subscriptions(provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE TABLE usage_periods (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 64),
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  period_start TEXT NOT NULL CHECK(length(period_start) BETWEEN 20 AND 35),
  period_end TEXT NOT NULL CHECK(length(period_end) BETWEEN 20 AND 35 AND period_end > period_start),
  credits_granted INTEGER NOT NULL CHECK(credits_granted >= 0),
  credits_consumed INTEGER NOT NULL DEFAULT 0 CHECK(credits_consumed >= 0),
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 20 AND 35),
  updated_at TEXT NOT NULL CHECK(length(updated_at) BETWEEN 20 AND 35),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(plan_id) REFERENCES plans(id) ON DELETE RESTRICT,
  UNIQUE(user_id, period_start, period_end),
  UNIQUE(id, user_id)
);

CREATE INDEX idx_usage_periods_user_period ON usage_periods(user_id, period_start DESC);

CREATE TABLE analyses (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 64),
  user_id TEXT NOT NULL,
  request_id TEXT CHECK(request_id IS NULL OR length(request_id) <= 64),
  idempotency_key TEXT CHECK(idempotency_key IS NULL OR length(idempotency_key) <= 191),
  status TEXT NOT NULL CHECK(status IN ('pending', 'completed', 'failed')),
  input_json TEXT NOT NULL CHECK(length(input_json) <= 262144),
  result_json TEXT CHECK(result_json IS NULL OR length(result_json) <= 1048576),
  error_code TEXT CHECK(error_code IS NULL OR length(error_code) <= 80),
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 20 AND 35),
  updated_at TEXT NOT NULL CHECK(length(updated_at) BETWEEN 20 AND 35),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, idempotency_key),
  UNIQUE(id, user_id)
);

CREATE INDEX idx_analyses_user_created ON analyses(user_id, created_at DESC);

CREATE TABLE credit_ledger (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 64),
  user_id TEXT NOT NULL,
  usage_period_id TEXT NOT NULL,
  analysis_id TEXT,
  entry_type TEXT NOT NULL CHECK(entry_type IN ('grant', 'consume', 'refund', 'adjustment')),
  delta_credits INTEGER NOT NULL CHECK(delta_credits <> 0),
  idempotency_key TEXT NOT NULL UNIQUE CHECK(length(idempotency_key) BETWEEN 1 AND 191),
  reason TEXT CHECK(reason IS NULL OR length(reason) <= 240),
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 20 AND 35),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(usage_period_id, user_id) REFERENCES usage_periods(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY(analysis_id, user_id) REFERENCES analyses(id, user_id) ON DELETE RESTRICT
);

CREATE INDEX idx_credit_ledger_user_created ON credit_ledger(user_id, created_at DESC);
CREATE INDEX idx_credit_ledger_usage_period ON credit_ledger(usage_period_id, created_at);

CREATE TABLE watchlist_items (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 64),
  user_id TEXT NOT NULL,
  analysis_id TEXT,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
  source_url TEXT NOT NULL CHECK(length(source_url) BETWEEN 1 AND 2048),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  metadata_json TEXT CHECK(metadata_json IS NULL OR length(metadata_json) <= 262144),
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 20 AND 35),
  updated_at TEXT NOT NULL CHECK(length(updated_at) BETWEEN 20 AND 35),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(analysis_id, user_id) REFERENCES analyses(id, user_id) ON DELETE NO ACTION,
  UNIQUE(user_id, source_url)
);

CREATE INDEX idx_watchlist_items_user_active ON watchlist_items(user_id, active, created_at DESC);

CREATE TABLE watchlist_snapshots (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 64),
  watchlist_item_id TEXT NOT NULL,
  observed_at TEXT NOT NULL CHECK(length(observed_at) BETWEEN 20 AND 35),
  market_price_ars REAL CHECK(market_price_ars IS NULL OR market_price_ars >= 0),
  landed_cost_ars REAL CHECK(landed_cost_ars IS NULL OR landed_cost_ars >= 0),
  payload_json TEXT CHECK(payload_json IS NULL OR length(payload_json) <= 524288),
  idempotency_key TEXT NOT NULL UNIQUE CHECK(length(idempotency_key) BETWEEN 1 AND 191),
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 20 AND 35),
  FOREIGN KEY(watchlist_item_id) REFERENCES watchlist_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_watchlist_snapshots_item_observed ON watchlist_snapshots(watchlist_item_id, observed_at DESC);

CREATE TABLE email_preferences (
  user_id TEXT PRIMARY KEY,
  digest_enabled INTEGER NOT NULL DEFAULT 1 CHECK(digest_enabled IN (0, 1)),
  alerts_enabled INTEGER NOT NULL DEFAULT 1 CHECK(alerts_enabled IN (0, 1)),
  marketing_enabled INTEGER NOT NULL DEFAULT 0 CHECK(marketing_enabled IN (0, 1)),
  timezone TEXT NOT NULL DEFAULT 'UTC' CHECK(length(timezone) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 20 AND 35),
  updated_at TEXT NOT NULL CHECK(length(updated_at) BETWEEN 20 AND 35),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE email_events (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 64),
  user_id TEXT,
  event_type TEXT NOT NULL CHECK(length(event_type) BETWEEN 1 AND 80),
  recipient TEXT NOT NULL CHECK(length(recipient) BETWEEN 3 AND 320),
  provider TEXT CHECK(provider IS NULL OR length(provider) <= 40),
  provider_message_id TEXT CHECK(provider_message_id IS NULL OR length(provider_message_id) <= 191),
  idempotency_key TEXT NOT NULL UNIQUE CHECK(length(idempotency_key) BETWEEN 1 AND 191),
  status TEXT NOT NULL CHECK(status IN ('queued', 'sent', 'delivered', 'failed', 'suppressed')),
  metadata_json TEXT CHECK(metadata_json IS NULL OR length(metadata_json) <= 262144),
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 20 AND 35),
  sent_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_email_events_provider_message
  ON email_events(provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX idx_email_events_user_created ON email_events(user_id, created_at DESC);

CREATE TABLE billing_events (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 64),
  provider TEXT NOT NULL CHECK(length(provider) BETWEEN 1 AND 40),
  provider_event_id TEXT NOT NULL CHECK(length(provider_event_id) BETWEEN 1 AND 191),
  event_type TEXT NOT NULL CHECK(length(event_type) BETWEEN 1 AND 120),
  user_id TEXT,
  subscription_id TEXT,
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256) = 64 AND payload_sha256 NOT GLOB '*[^0-9a-f]*'),
  status TEXT NOT NULL CHECK(status IN ('received', 'processed', 'ignored', 'failed')),
  error_code TEXT CHECK(error_code IS NULL OR length(error_code) <= 80),
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 20 AND 35),
  processed_at TEXT,
  CHECK(subscription_id IS NULL OR user_id IS NOT NULL),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(subscription_id, user_id) REFERENCES subscriptions(id, user_id) ON DELETE SET NULL,
  UNIQUE(provider, provider_event_id)
);

CREATE INDEX idx_billing_events_status_created ON billing_events(status, created_at);
CREATE INDEX idx_billing_events_user_created ON billing_events(user_id, created_at DESC);
