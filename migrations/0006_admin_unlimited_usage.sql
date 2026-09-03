PRAGMA foreign_keys = ON;

-- Administrative QA entitlement. A very large server-owned allowance preserves
-- the existing atomic reservation/ledger invariants while the UI presents this
-- plan as unlimited. It is intentionally not a commercial plan.
INSERT INTO plans (
  id, code, name, monthly_credits, monitoring_enabled, active, created_at, updated_at
) VALUES (
  'plan-admin-v1', 'admin', 'Admin', 1000000000, 1, 1,
  '2026-09-03T00:00:00.000Z', '2026-09-03T00:00:00.000Z'
)
ON CONFLICT(code) DO UPDATE SET
  name = excluded.name,
  monthly_credits = excluded.monthly_credits,
  monitoring_enabled = excluded.monitoring_enabled,
  active = 1,
  updated_at = excluded.updated_at;

-- Grant the existing administrator account if it is already synchronized.
INSERT OR IGNORE INTO subscriptions (
  id, user_id, plan_id, provider, provider_customer_id, provider_subscription_id,
  status, current_period_start, current_period_end, cancel_at_period_end,
  created_at, updated_at
)
SELECT
  substr('admin-usage-' || u.id, 1, 64),
  u.id,
  p.id,
  'admin',
  NULL,
  NULL,
  'active',
  NULL,
  NULL,
  0,
  '2026-09-03T00:00:00.000Z',
  '2026-09-03T00:00:00.000Z'
FROM users u
JOIN plans p ON p.code = 'admin'
WHERE lower(trim(COALESCE(u.email, ''))) = lower('marciofabrizio@gmail.com');

-- Clerk profile sync can populate the email after this migration ran. Keep the
-- entitlement convergent without requiring a manual production DB edit.
CREATE TRIGGER IF NOT EXISTS trg_users_admin_usage_after_insert
AFTER INSERT ON users
WHEN lower(trim(COALESCE(NEW.email, ''))) = lower('marciofabrizio@gmail.com')
BEGIN
  INSERT OR IGNORE INTO subscriptions (
    id, user_id, plan_id, provider, status,
    current_period_start, current_period_end, cancel_at_period_end,
    created_at, updated_at
  ) VALUES (
    substr('admin-usage-' || NEW.id, 1, 64),
    NEW.id,
    (SELECT id FROM plans WHERE code = 'admin' AND active = 1 LIMIT 1),
    'admin',
    'active',
    NULL,
    NULL,
    0,
    NEW.updated_at,
    NEW.updated_at
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_users_admin_usage_after_email_update
AFTER UPDATE OF email ON users
WHEN lower(trim(COALESCE(NEW.email, ''))) = lower('marciofabrizio@gmail.com')
BEGIN
  INSERT OR IGNORE INTO subscriptions (
    id, user_id, plan_id, provider, status,
    current_period_start, current_period_end, cancel_at_period_end,
    created_at, updated_at
  ) VALUES (
    substr('admin-usage-' || NEW.id, 1, 64),
    NEW.id,
    (SELECT id FROM plans WHERE code = 'admin' AND active = 1 LIMIT 1),
    'admin',
    'active',
    NULL,
    NULL,
    0,
    NEW.updated_at,
    NEW.updated_at
  );
END;
