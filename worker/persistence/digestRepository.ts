import type { D1DatabaseLike, D1Value } from './d1'

export type DigestRunStatus = 'running' | 'completed' | 'partial' | 'failed'
export type DigestRecipientStatus = 'pending' | 'queued' | 'sent' | 'suppressed' | 'failed' | 'skipped' | 'blocked'

export type DigestRunRow = {
  id: string
  run_key: string
  period_start: string
  period_end: string
  due_at: string
  status: DigestRunStatus
  cursor_user_id: string | null
  invocation_count: number
  last_error_code: string | null
  started_at: string
  updated_at: string
  completed_at: string | null
}

export type DigestRecipientRow = {
  run_id: string
  user_id: string
  status: DigestRecipientStatus
  attempt_count: number
  email_event_id: string | null
  error_code: string | null
  created_at: string
  updated_at: string
  processed_at: string | null
}

export type DigestEligibleUser = {
  user_id: string
  timezone: string
}

export type DigestRunSummary = {
  runId: string
  runKey: string
  status: DigestRunStatus
  invocationCount: number
  processed: number
  pending: number
  queued: number
  sent: number
  suppressed: number
  failed: number
  skipped: number
  blocked: number
  completedAt: string | null
  lastErrorCode: string | null
}

function required(label: string, value: string, max: number) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) throw new Error(`${label}_invalid`)
  return value
}

function iso(label: string, value: string) {
  if (typeof value !== 'string' || !value.endsWith('Z') || Number.isNaN(Date.parse(value))) throw new Error(`${label}_invalid`)
  return new Date(value).toISOString()
}

function safeLimit(value: number, max = 100) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error('digest_limit_invalid')
  return value
}

async function first<T>(db: D1DatabaseLike, sql: string, values: D1Value[] = []) {
  return db.prepare(sql).bind(...values).first<T>()
}

async function all<T>(db: D1DatabaseLike, sql: string, values: D1Value[] = []) {
  return (await db.prepare(sql).bind(...values).all<T>()).results
}

async function run(db: D1DatabaseLike, sql: string, values: D1Value[] = []) {
  return db.prepare(sql).bind(...values).run()
}

export class DigestRepository {
  constructor(private readonly db: D1DatabaseLike, private readonly clock: () => Date = () => new Date()) {}

  private now() { return this.clock().toISOString() }

  async getOrCreateRun(input: {
    id: string
    runKey: string
    periodStart: string
    periodEnd: string
    dueAt: string
  }) {
    const now = this.now()
    await run(this.db,
      `INSERT INTO digest_runs (
        id, run_key, period_start, period_end, due_at, status, cursor_user_id,
        invocation_count, last_error_code, started_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, 'running', NULL, 0, NULL, ?, ?, NULL)
      ON CONFLICT(run_key) DO NOTHING`,
      [
        required('id', input.id, 64),
        required('runKey', input.runKey, 80),
        iso('periodStart', input.periodStart),
        iso('periodEnd', input.periodEnd),
        iso('dueAt', input.dueAt),
        now,
        now,
      ],
    )
    const row = await this.getRunByKey(input.runKey)
    if (!row) throw new Error('digest_run_unavailable')
    if (row.period_start !== iso('periodStart', input.periodStart) || row.period_end !== iso('periodEnd', input.periodEnd)) {
      throw new Error('digest_run_key_collision')
    }
    return row
  }

  getRunByKey(runKey: string) {
    return first<DigestRunRow>(this.db, 'SELECT * FROM digest_runs WHERE run_key = ?', [required('runKey', runKey, 80)])
  }

  getRun(runId: string) {
    return first<DigestRunRow>(this.db, 'SELECT * FROM digest_runs WHERE id = ?', [required('runId', runId, 64)])
  }

  latestRun() {
    return first<DigestRunRow>(this.db, 'SELECT * FROM digest_runs ORDER BY period_start DESC, started_at DESC LIMIT 1')
  }

  async bumpInvocation(runId: string) {
    const now = this.now()
    await run(this.db,
      `UPDATE digest_runs
       SET invocation_count = invocation_count + 1, updated_at = ?
       WHERE id = ? AND completed_at IS NULL`,
      [now, required('runId', runId, 64)],
    )
    return this.getRun(runId)
  }

  listEligibleAfter(cursorUserId: string | null, limit: number) {
    const cursor = cursorUserId ?? ''
    return all<DigestEligibleUser>(this.db,
      `SELECT u.id AS user_id, COALESCE(ep.timezone, 'UTC') AS timezone
       FROM users u
       LEFT JOIN email_preferences ep ON ep.user_id = u.id
       WHERE u.id > ?
         AND u.email IS NOT NULL
         AND length(trim(u.email)) >= 3
         AND COALESCE(ep.digest_enabled, 1) = 1
         AND EXISTS (
           SELECT 1 FROM watchlist_items wi
           WHERE wi.user_id = u.id AND wi.active = 1
         )
       ORDER BY u.id
       LIMIT ?`,
      [cursor, safeLimit(limit)],
    )
  }

  async countEligibleUsers() {
    const row = await first<{ count: number }>(this.db,
      `SELECT COUNT(*) AS count
       FROM users u
       LEFT JOIN email_preferences ep ON ep.user_id = u.id
       WHERE u.email IS NOT NULL
         AND length(trim(u.email)) >= 3
         AND COALESCE(ep.digest_enabled, 1) = 1
         AND EXISTS (
           SELECT 1 FROM watchlist_items wi
           WHERE wi.user_id = u.id AND wi.active = 1
         )`,
    )
    return Number(row?.count ?? 0)
  }

  async hasEligibleAfter(cursorUserId: string | null) {
    const rows = await this.listEligibleAfter(cursorUserId, 1)
    return rows.length > 0
  }

  async ensureRecipient(runId: string, userId: string) {
    const now = this.now()
    await run(this.db,
      `INSERT INTO digest_run_recipients (
        run_id, user_id, status, attempt_count, email_event_id, error_code,
        created_at, updated_at, processed_at
      ) VALUES (?, ?, 'pending', 0, NULL, NULL, ?, ?, NULL)
      ON CONFLICT(run_id, user_id) DO NOTHING`,
      [required('runId', runId, 64), required('userId', userId, 64), now, now],
    )
    const row = await this.getRecipient(runId, userId)
    if (!row) throw new Error('digest_recipient_unavailable')
    return row
  }

  getRecipient(runId: string, userId: string) {
    return first<DigestRecipientRow>(this.db,
      'SELECT * FROM digest_run_recipients WHERE run_id = ? AND user_id = ?',
      [required('runId', runId, 64), required('userId', userId, 64)],
    )
  }

  listRetryable(runId: string, maxAttempts: number, limit: number) {
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) throw new Error('digest_attempt_limit_invalid')
    return all<DigestRecipientRow>(this.db,
      `SELECT * FROM digest_run_recipients
       WHERE run_id = ?
         AND status IN ('pending', 'queued', 'failed')
         AND attempt_count < ?
       ORDER BY updated_at ASC, user_id ASC
       LIMIT ?`,
      [required('runId', runId, 64), maxAttempts, safeLimit(limit)],
    )
  }

  async markRecipient(input: {
    runId: string
    userId: string
    status: DigestRecipientStatus
    emailEventId?: string | null
    errorCode?: string | null
  }) {
    const now = this.now()
    const terminal = ['sent', 'suppressed', 'skipped', 'blocked'].includes(input.status)
    await run(this.db,
      `UPDATE digest_run_recipients
       SET status = ?,
           attempt_count = attempt_count + 1,
           email_event_id = ?,
           error_code = ?,
           updated_at = ?,
           processed_at = ?
       WHERE run_id = ? AND user_id = ?`,
      [
        input.status,
        input.emailEventId ? required('emailEventId', input.emailEventId, 64) : null,
        input.errorCode ? required('errorCode', input.errorCode, 80) : null,
        now,
        terminal ? now : null,
        required('runId', input.runId, 64),
        required('userId', input.userId, 64),
      ],
    )
    return this.getRecipient(input.runId, input.userId)
  }

  async setCursor(runId: string, userId: string) {
    const now = this.now()
    await run(this.db,
      `UPDATE digest_runs SET cursor_user_id = ?, updated_at = ? WHERE id = ? AND completed_at IS NULL`,
      [required('userId', userId, 64), now, required('runId', runId, 64)],
    )
  }

  async retryableCount(runId: string, maxAttempts: number) {
    const row = await first<{ count: number }>(this.db,
      `SELECT COUNT(*) AS count FROM digest_run_recipients
       WHERE run_id = ? AND status IN ('pending','queued','failed') AND attempt_count < ?`,
      [required('runId', runId, 64), maxAttempts],
    )
    return Number(row?.count ?? 0)
  }

  async finalize(runId: string, status: Exclude<DigestRunStatus, 'running'>, lastErrorCode: string | null = null) {
    const now = this.now()
    await run(this.db,
      `UPDATE digest_runs
       SET status = ?, last_error_code = ?, updated_at = ?, completed_at = ?
       WHERE id = ? AND completed_at IS NULL`,
      [status, lastErrorCode, now, now, required('runId', runId, 64)],
    )
    return this.getRun(runId)
  }

  async summary(runId: string): Promise<DigestRunSummary> {
    const runRow = await this.getRun(runId)
    if (!runRow) throw new Error('digest_run_unavailable')
    const counts = await first<Record<string, number>>(this.db,
      `SELECT
        COUNT(*) AS processed,
        SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) AS queued,
        SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN status='suppressed' THEN 1 ELSE 0 END) AS suppressed,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END) AS skipped,
        SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) AS blocked
       FROM digest_run_recipients WHERE run_id = ?`,
      [runId],
    )
    const num = (key: string) => Number(counts?.[key] ?? 0)
    return {
      runId: runRow.id,
      runKey: runRow.run_key,
      status: runRow.status,
      invocationCount: Number(runRow.invocation_count),
      processed: num('processed'),
      pending: num('pending'),
      queued: num('queued'),
      sent: num('sent'),
      suppressed: num('suppressed'),
      failed: num('failed'),
      skipped: num('skipped'),
      blocked: num('blocked'),
      completedAt: runRow.completed_at,
      lastErrorCode: runRow.last_error_code,
    }
  }
}
