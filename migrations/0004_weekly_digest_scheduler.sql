PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS digest_runs (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 64),
  run_key TEXT NOT NULL UNIQUE CHECK(length(run_key) BETWEEN 8 AND 80),
  period_start TEXT NOT NULL CHECK(length(period_start) BETWEEN 20 AND 35),
  period_end TEXT NOT NULL CHECK(length(period_end) BETWEEN 20 AND 35 AND period_end > period_start),
  due_at TEXT NOT NULL CHECK(length(due_at) BETWEEN 20 AND 35),
  status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'partial', 'failed')),
  cursor_user_id TEXT CHECK(cursor_user_id IS NULL OR length(cursor_user_id) <= 64),
  invocation_count INTEGER NOT NULL DEFAULT 0 CHECK(invocation_count >= 0),
  last_error_code TEXT CHECK(last_error_code IS NULL OR length(last_error_code) <= 80),
  started_at TEXT NOT NULL CHECK(length(started_at) BETWEEN 20 AND 35),
  updated_at TEXT NOT NULL CHECK(length(updated_at) BETWEEN 20 AND 35),
  completed_at TEXT CHECK(completed_at IS NULL OR length(completed_at) BETWEEN 20 AND 35)
);

CREATE INDEX IF NOT EXISTS idx_digest_runs_status_updated
  ON digest_runs(status, updated_at);

CREATE TABLE IF NOT EXISTS digest_run_recipients (
  run_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'queued', 'sent', 'suppressed', 'failed', 'skipped', 'blocked')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0 AND attempt_count <= 10),
  email_event_id TEXT,
  error_code TEXT CHECK(error_code IS NULL OR length(error_code) <= 80),
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 20 AND 35),
  updated_at TEXT NOT NULL CHECK(length(updated_at) BETWEEN 20 AND 35),
  processed_at TEXT CHECK(processed_at IS NULL OR length(processed_at) BETWEEN 20 AND 35),
  PRIMARY KEY(run_id, user_id),
  FOREIGN KEY(run_id) REFERENCES digest_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(email_event_id) REFERENCES email_events(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_digest_recipients_run_status
  ON digest_run_recipients(run_id, status, attempt_count, updated_at);
CREATE INDEX IF NOT EXISTS idx_digest_recipients_user_created
  ON digest_run_recipients(user_id, created_at DESC);
