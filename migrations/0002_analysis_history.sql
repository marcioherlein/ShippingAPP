-- Stage 3 — private analysis history
-- Keep analysis identity stable while allowing users to remove items from their visible history.
-- Soft deletion avoids breaking future credit-ledger/watchlist references to an analysis.

ALTER TABLE analyses
  ADD COLUMN deleted_at TEXT
  CHECK(deleted_at IS NULL OR length(deleted_at) BETWEEN 20 AND 35);

CREATE INDEX idx_analyses_user_visible_created
  ON analyses(user_id, deleted_at, created_at DESC, id DESC);
