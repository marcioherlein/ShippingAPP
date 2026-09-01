PRAGMA foreign_keys = ON;

-- Stage 5 entitlement defaults. These are usage limits, not commercial prices;
-- billing/price mapping remains Stage 9. Existing rows win so production can
-- override these values as server-owned configuration without a browser path.
INSERT INTO plans (id, code, name, monthly_credits, monitoring_enabled, active, created_at, updated_at)
VALUES
  ('plan-free-v1', 'free', 'Free', 3, 0, 1, '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'),
  ('plan-pro-v1', 'pro', 'Pro', 30, 1, 1, '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'),
  ('plan-business-v1', 'business', 'Business', 100, 1, 1, '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z')
ON CONFLICT(code) DO NOTHING;

CREATE TABLE credit_reservations (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 64),
  user_id TEXT NOT NULL,
  usage_period_id TEXT NOT NULL,
  operation_key TEXT NOT NULL CHECK(length(operation_key) BETWEEN 8 AND 120),
  route_id TEXT NOT NULL CHECK(length(route_id) BETWEEN 1 AND 80),
  operation_kind TEXT NOT NULL CHECK(operation_kind IN ('standalone', 'full_analysis')),
  credits INTEGER NOT NULL DEFAULT 1 CHECK(credits BETWEEN 1 AND 100),
  attempt_no INTEGER NOT NULL DEFAULT 1 CHECK(attempt_no >= 1),
  status TEXT NOT NULL CHECK(status IN ('running', 'continuation_ready', 'continuation_running', 'settled', 'released')),
  lease_expires_at TEXT NOT NULL CHECK(length(lease_expires_at) BETWEEN 20 AND 35),
  initial_response_status INTEGER CHECK(initial_response_status IS NULL OR initial_response_status BETWEEN 100 AND 599),
  initial_response_content_type TEXT CHECK(initial_response_content_type IS NULL OR length(initial_response_content_type) <= 120),
  initial_response_body TEXT CHECK(initial_response_body IS NULL OR length(initial_response_body) <= 1048576),
  continuation_response_status INTEGER CHECK(continuation_response_status IS NULL OR continuation_response_status BETWEEN 100 AND 599),
  continuation_response_content_type TEXT CHECK(continuation_response_content_type IS NULL OR length(continuation_response_content_type) <= 120),
  continuation_response_body TEXT CHECK(continuation_response_body IS NULL OR length(continuation_response_body) <= 1048576),
  last_error_code TEXT CHECK(last_error_code IS NULL OR length(last_error_code) <= 80),
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 20 AND 35),
  updated_at TEXT NOT NULL CHECK(length(updated_at) BETWEEN 20 AND 35),
  settled_at TEXT CHECK(settled_at IS NULL OR length(settled_at) BETWEEN 20 AND 35),
  released_at TEXT CHECK(released_at IS NULL OR length(released_at) BETWEEN 20 AND 35),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(usage_period_id, user_id) REFERENCES usage_periods(id, user_id) ON DELETE CASCADE,
  UNIQUE(user_id, operation_key),
  UNIQUE(id, user_id)
);

CREATE INDEX idx_credit_reservations_user_status
  ON credit_reservations(user_id, status, updated_at DESC);
CREATE INDEX idx_credit_reservations_lease
  ON credit_reservations(status, lease_expires_at);

-- Quota is claimed in the same SQLite statement that creates the reservation.
-- D1 serializes writes, and the trigger re-checks the current period counter at
-- write time, so concurrent inserts cannot all observe the same last credit.
-- Refunded attempts still remain in the append-only consume ledger. We cap
-- attempted paid work to 4x the period allowance so provider-error/refund loops
-- cannot become unlimited free external work while genuine provider failures
-- can still restore the user's normal credit balance.
CREATE TRIGGER trg_credit_reservations_before_insert
BEFORE INSERT ON credit_reservations
BEGIN
  SELECT CASE
    WHEN NEW.status <> 'running' THEN RAISE(ABORT, 'reservation_must_start_running')
    WHEN NEW.attempt_no <> 1 THEN RAISE(ABORT, 'reservation_initial_attempt_invalid')
    WHEN NOT EXISTS (
      SELECT 1 FROM usage_periods up
      WHERE up.id = NEW.usage_period_id AND up.user_id = NEW.user_id
    ) THEN RAISE(ABORT, 'usage_period_not_found')
    WHEN NOT EXISTS (
      SELECT 1 FROM usage_periods up
      WHERE up.id = NEW.usage_period_id
        AND up.user_id = NEW.user_id
        AND up.period_start <= NEW.created_at
        AND NEW.created_at < up.period_end
    ) THEN RAISE(ABORT, 'reservation_period_expired')
    WHEN EXISTS (
      SELECT 1 FROM usage_periods up
      WHERE up.id = NEW.usage_period_id
        AND up.user_id = NEW.user_id
        AND up.credits_consumed + NEW.credits > up.credits_granted
    ) THEN RAISE(ABORT, 'quota_exhausted')
    WHEN EXISTS (
      SELECT 1 FROM usage_periods up
      WHERE up.id = NEW.usage_period_id
        AND up.user_id = NEW.user_id
        AND COALESCE((
          SELECT SUM(-cl.delta_credits)
          FROM credit_ledger cl
          WHERE cl.user_id = NEW.user_id
            AND cl.usage_period_id = NEW.usage_period_id
            AND cl.entry_type = 'consume'
        ), 0) + NEW.credits > up.credits_granted * 4
    ) THEN RAISE(ABORT, 'attempt_limit_exhausted')
  END;
END;

CREATE TRIGGER trg_credit_reservations_after_insert
AFTER INSERT ON credit_reservations
BEGIN
  UPDATE usage_periods
  SET credits_consumed = credits_consumed + NEW.credits,
      updated_at = NEW.updated_at
  WHERE id = NEW.usage_period_id AND user_id = NEW.user_id;

  INSERT INTO credit_ledger (
    id, user_id, usage_period_id, analysis_id, entry_type,
    delta_credits, idempotency_key, reason, created_at
  ) VALUES (
    'ledger-c-' || NEW.id || '-' || NEW.attempt_no,
    NEW.user_id,
    NEW.usage_period_id,
    NULL,
    'consume',
    -NEW.credits,
    'reserve:' || NEW.id || ':' || NEW.attempt_no,
    'Reserved for ' || NEW.route_id,
    NEW.updated_at
  );
END;

-- Reservation identity and economic amount are immutable. Retrying a released
-- operation reuses the same logical operation row but increments attempt_no.
CREATE TRIGGER trg_credit_reservations_before_update_identity
BEFORE UPDATE ON credit_reservations
WHEN NEW.user_id <> OLD.user_id
  OR NEW.usage_period_id <> OLD.usage_period_id
  OR NEW.operation_key <> OLD.operation_key
  OR NEW.route_id <> OLD.route_id
  OR NEW.operation_kind <> OLD.operation_kind
  OR NEW.credits <> OLD.credits
BEGIN
  SELECT RAISE(ABORT, 'reservation_identity_immutable');
END;

CREATE TRIGGER trg_credit_reservations_before_update_transition
BEFORE UPDATE ON credit_reservations
BEGIN
  SELECT CASE
    WHEN NEW.attempt_no <> OLD.attempt_no
      AND NOT (
        OLD.status = 'released'
        AND NEW.status = 'running'
        AND NEW.attempt_no = OLD.attempt_no + 1
      )
      THEN RAISE(ABORT, 'reservation_attempt_transition_invalid')
    WHEN NEW.status <> OLD.status
      AND NOT (
        (OLD.status = 'running' AND NEW.status IN ('continuation_ready', 'settled', 'released'))
        OR (OLD.status = 'continuation_ready' AND NEW.status IN ('continuation_running', 'released'))
        OR (OLD.status = 'continuation_running' AND NEW.status IN ('settled', 'released'))
        OR (OLD.status = 'released' AND NEW.status = 'running')
      )
      THEN RAISE(ABORT, 'reservation_status_transition_invalid')
    WHEN OLD.status = 'released' AND NEW.status = 'running' AND NOT EXISTS (
      SELECT 1 FROM usage_periods up
      WHERE up.id = OLD.usage_period_id
        AND up.user_id = OLD.user_id
        AND up.period_start <= NEW.updated_at
        AND NEW.updated_at < up.period_end
    ) THEN RAISE(ABORT, 'reservation_period_expired')
    WHEN OLD.status = 'released' AND NEW.status = 'running' AND EXISTS (
      SELECT 1 FROM usage_periods up
      WHERE up.id = OLD.usage_period_id
        AND up.user_id = OLD.user_id
        AND up.credits_consumed + OLD.credits > up.credits_granted
    ) THEN RAISE(ABORT, 'quota_exhausted')
    WHEN OLD.status = 'released' AND NEW.status = 'running' AND EXISTS (
      SELECT 1 FROM usage_periods up
      WHERE up.id = OLD.usage_period_id
        AND up.user_id = OLD.user_id
        AND COALESCE((
          SELECT SUM(-cl.delta_credits)
          FROM credit_ledger cl
          WHERE cl.user_id = OLD.user_id
            AND cl.usage_period_id = OLD.usage_period_id
            AND cl.entry_type = 'consume'
        ), 0) + OLD.credits > up.credits_granted * 4
    ) THEN RAISE(ABORT, 'attempt_limit_exhausted')
    WHEN OLD.status <> 'released' AND NEW.status = 'released' AND EXISTS (
      SELECT 1 FROM usage_periods up
      WHERE up.id = OLD.usage_period_id
        AND up.user_id = OLD.user_id
        AND up.credits_consumed < OLD.credits
    ) THEN RAISE(ABORT, 'reservation_refund_counter_invalid')
  END;
END;

-- A released reservation may be retried only inside its original active usage
-- period and within the non-refundable attempt budget. The new attempt consumes
-- exactly once and receives a distinct immutable ledger key.
CREATE TRIGGER trg_credit_reservations_after_retry
AFTER UPDATE OF status ON credit_reservations
WHEN OLD.status = 'released' AND NEW.status = 'running'
BEGIN
  UPDATE usage_periods
  SET credits_consumed = credits_consumed + NEW.credits,
      updated_at = NEW.updated_at
  WHERE id = NEW.usage_period_id AND user_id = NEW.user_id;

  INSERT INTO credit_ledger (
    id, user_id, usage_period_id, analysis_id, entry_type,
    delta_credits, idempotency_key, reason, created_at
  ) VALUES (
    'ledger-c-' || NEW.id || '-' || NEW.attempt_no,
    NEW.user_id,
    NEW.usage_period_id,
    NULL,
    'consume',
    -NEW.credits,
    'reserve:' || NEW.id || ':' || NEW.attempt_no,
    'Retry reserved for ' || NEW.route_id,
    NEW.updated_at
  );
END;

-- Release is an exactly-once state transition. Only the first transition into
-- released can decrement usage and append a refund ledger entry; the transition
-- trigger above aborts instead of allowing ledger/counter divergence.
CREATE TRIGGER trg_credit_reservations_after_release
AFTER UPDATE OF status ON credit_reservations
WHEN OLD.status <> 'released' AND NEW.status = 'released'
BEGIN
  UPDATE usage_periods
  SET credits_consumed = credits_consumed - NEW.credits,
      updated_at = NEW.updated_at
  WHERE id = NEW.usage_period_id
    AND user_id = NEW.user_id
    AND credits_consumed >= NEW.credits;

  INSERT INTO credit_ledger (
    id, user_id, usage_period_id, analysis_id, entry_type,
    delta_credits, idempotency_key, reason, created_at
  ) VALUES (
    'ledger-r-' || NEW.id || '-' || NEW.attempt_no,
    NEW.user_id,
    NEW.usage_period_id,
    NULL,
    'refund',
    NEW.credits,
    'refund:' || NEW.id || ':' || NEW.attempt_no,
    COALESCE('Released: ' || NEW.last_error_code, 'Released reservation'),
    NEW.updated_at
  );
END;
