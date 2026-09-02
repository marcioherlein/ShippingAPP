PRAGMA foreign_keys = ON;

-- One paid full analysis may need a few conversational NCM refinements. Keep
-- those refinements inside the same reservation/credit, but cap provider work
-- so a single case cannot become an unbounded free classification session.
ALTER TABLE credit_reservations
  ADD COLUMN continuation_attempt_no INTEGER NOT NULL DEFAULT 0
  CHECK(continuation_attempt_no BETWEEN 0 AND 3);

-- Stage 5 originally treated an NCM continuation as one-shot. Iterative
-- clarification needs the safe cycle:
-- continuation_ready -> continuation_running -> continuation_ready
-- until a strong result settles the reservation (or the third attempt closes it).
DROP TRIGGER IF EXISTS trg_credit_reservations_before_update_transition;

CREATE TRIGGER trg_credit_reservations_before_update_transition
BEFORE UPDATE ON credit_reservations
BEGIN
  SELECT (CASE
    WHEN NEW.attempt_no <> OLD.attempt_no
      AND NOT (
        OLD.status = 'released'
        AND NEW.status = 'running'
        AND NEW.attempt_no = OLD.attempt_no + 1
      )
      THEN RAISE(ABORT, 'reservation_attempt_transition_invalid')
    WHEN NEW.continuation_attempt_no <> OLD.continuation_attempt_no
      AND NOT (
        (
          OLD.status = 'continuation_ready'
          AND NEW.status = 'continuation_running'
          AND NEW.continuation_attempt_no = OLD.continuation_attempt_no + 1
          AND NEW.continuation_attempt_no <= 3
        )
        OR (
          OLD.status = 'released'
          AND NEW.status = 'running'
          AND NEW.continuation_attempt_no = 0
        )
      )
      THEN RAISE(ABORT, 'reservation_continuation_attempt_transition_invalid')
    WHEN NEW.status <> OLD.status
      AND NOT (
        (OLD.status = 'running' AND NEW.status IN ('continuation_ready', 'settled', 'released'))
        OR (OLD.status = 'continuation_ready' AND NEW.status IN ('continuation_running', 'released'))
        OR (OLD.status = 'continuation_running' AND NEW.status IN ('settled', 'released'))
        OR (
          OLD.status = 'continuation_running'
          AND NEW.status = 'continuation_ready'
          AND OLD.continuation_attempt_no < 3
        )
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
  END);
END;
