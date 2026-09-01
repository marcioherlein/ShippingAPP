import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { D1DatabaseLike, D1PreparedStatementLike, D1RunResultLike, D1Value } from './persistence/d1'
import { runWeeklyDigestSchedulerWithLease } from './weeklyDigestLease'

class NodeStatement implements D1PreparedStatementLike {
  constructor(private readonly statement: StatementSync, private readonly values: D1Value[] = []) {}
  bind(...values: D1Value[]) { return new NodeStatement(this.statement, values) }
  async first<T>() { return (this.statement.get(...this.values as any[]) as T | undefined) ?? null }
  async all<T>() { return { results: this.statement.all(...this.values as any[]) as T[] } }
  async run(): Promise<D1RunResultLike> {
    const result = this.statement.run(...this.values as any[])
    return { success: true, meta: { changes: Number(result.changes) } }
  }
}

class NodeDatabase implements D1DatabaseLike {
  constructor(readonly raw: DatabaseSync) {}
  prepare(sql: string) { return new NodeStatement(this.raw.prepare(sql)) }
}

const NOW = '2026-09-07T12:00:00.000Z'
const USER = 'digest-concurrency-user'

function migrate(sqlite: DatabaseSync) {
  for (const file of ['0001_saas_foundation.sql', '0002_analysis_history.sql', '0003_usage_entitlements.sql', '0004_weekly_digest_scheduler.sql']) {
    sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'))
  }
}

function seedEligibleUser(sqlite: DatabaseSync) {
  sqlite.prepare("INSERT INTO users (id, auth_provider, auth_subject, email, display_name, created_at, updated_at) VALUES (?, 'test', ?, ?, ?, ?, ?)")
    .run(USER, `sub-${USER}`, `${USER}@example.com`, USER, NOW, NOW)
  sqlite.prepare("INSERT INTO email_preferences (user_id, digest_enabled, alerts_enabled, marketing_enabled, timezone, created_at, updated_at) VALUES (?, 1, 1, 0, 'UTC', ?, ?)")
    .run(USER, NOW, NOW)
  sqlite.prepare("INSERT INTO watchlist_items (id, user_id, analysis_id, title, source_url, active, metadata_json, created_at, updated_at) VALUES ('lease-item', ?, NULL, 'Lease product', 'https://example.com/lease', 1, NULL, ?, ?)")
    .run(USER, NOW, NOW)
  for (const [id, at, price, margin] of [
    ['lease-prev', '2026-09-06T10:00:00.000Z', 200000, 30],
    ['lease-latest', '2026-09-07T10:00:00.000Z', 220000, 35],
  ] as const) {
    sqlite.prepare('INSERT INTO watchlist_snapshots (id, watchlist_item_id, observed_at, market_price_ars, landed_cost_ars, payload_json, idempotency_key, created_at) VALUES (?, \'lease-item\', ?, ?, 100000, ?, ?, ?)')
      .run(id, at, price, JSON.stringify({ grossMarginPct: margin, provenance: { market: { status: 'live' } } }), `key-${id}`, NOW)
  }
}

function env(db: NodeDatabase) {
  return {
    DB: db,
    EMAIL_SENDING_ENABLED: 'true',
    RESEND_API_KEY: 're_test_scheduler',
    EMAIL_FROM: 'ShippingAPP <mail@example.com>',
    EMAIL_UNSUBSCRIBE_SECRET: 'scheduler-secret-abcdefghijklmnopqrstuvwxyz-123456',
    EMAIL_PUBLIC_BASE_URL: 'https://shippingapp.example.com',
  }
}

describe('Stage 7 weekly digest run lease', () => {
  let sqlite: DatabaseSync
  let db: NodeDatabase

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:')
    migrate(sqlite)
    seedEligibleUser(sqlite)
    db = new NodeDatabase(sqlite)
  })
  afterEach(() => sqlite.close())

  it('serializes two truly concurrent cron invocations so only one crosses the delivery boundary', async () => {
    let sends = 0
    const deps = {
      clock: () => new Date(NOW),
      sendEmail: async () => {
        sends += 1
        await new Promise((resolve) => setTimeout(resolve, 30))
        return { status: 'sent' as const, replayed: false }
      },
    }

    const [one, two] = await Promise.all([
      runWeeklyDigestSchedulerWithLease(env(db), deps),
      runWeeklyDigestSchedulerWithLease(env(db), deps),
    ])

    expect(sends).toBe(1)
    expect([one.status, two.status]).toContain('completed')
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM digest_runs').get()).toEqual({ count: 1 })
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM digest_run_recipients').get()).toEqual({ count: 1 })
    expect(sqlite.prepare("SELECT status FROM digest_run_recipients WHERE user_id=?").get(USER)).toEqual({ status: 'sent' })

    const replay = await runWeeklyDigestSchedulerWithLease(env(db), deps)
    expect(replay.status).toBe('completed')
    expect(sends).toBe(1)
  })

  it('fails closed while another lease is live and recovers after an abandoned lease expires', async () => {
    sqlite.prepare("INSERT INTO digest_runs (id, run_key, period_start, period_end, due_at, status, cursor_user_id, invocation_count, last_error_code, lease_owner, lease_expires_at, started_at, updated_at, completed_at) VALUES ('leased-run', 'weekly:2026-09-07', '2026-09-07T00:00:00.000Z', '2026-09-14T00:00:00.000Z', '2026-09-07T11:00:00.000Z', 'running', NULL, 0, NULL, 'other-worker', '2026-09-07T12:05:00.000Z', ?, ?, NULL)")
      .run(NOW, NOW)

    let sends = 0
    const sendEmail = async () => { sends += 1; return { status: 'sent' as const, replayed: false } }
    const blocked = await runWeeklyDigestSchedulerWithLease(env(db), { clock: () => new Date(NOW), sendEmail })
    expect(blocked.status).toBe('running')
    expect(sends).toBe(0)

    const recovered = await runWeeklyDigestSchedulerWithLease(env(db), {
      clock: () => new Date('2026-09-07T12:06:00.000Z'),
      sendEmail,
    })
    expect(recovered.status).toBe('completed')
    expect(sends).toBe(1)
    expect(sqlite.prepare("SELECT lease_owner, lease_expires_at FROM digest_runs WHERE id='leased-run'").get()).toEqual({ lease_owner: null, lease_expires_at: null })
  })
})
