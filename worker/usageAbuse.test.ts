import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthIdentity } from './auth'
import type { D1DatabaseLike, D1PreparedStatementLike, D1RunResultLike, D1Value } from './persistence/d1'
import { UsageRepository } from './persistence/usageRepository'
import { withUsageEntitlement } from './usage'

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

const USER = 'usage-abuse-user-00000000-0000-4000-8000-0001'
const NOW = '2026-08-31T20:30:00.000Z'
const user: AuthIdentity = { kind: 'user', provider: 'clerk', subject: 'usage-abuse-subject', userId: USER }

function seed(sqlite: DatabaseSync) {
  for (const migration of ['0001_saas_foundation.sql', '0002_analysis_history.sql', '0003_usage_entitlements.sql']) {
    sqlite.exec(readFileSync(`migrations/${migration}`, 'utf8'))
  }
  sqlite.prepare("INSERT INTO users (id, auth_provider, auth_subject, created_at, updated_at) VALUES (?, 'test', 'usage-abuse-subject', ?, ?)")
    .run(USER, NOW, NOW)
}

function post(path: string, key: string) {
  return new Request(`https://shippingapp.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': key },
    body: '{}',
  })
}

function scalar(sqlite: DatabaseSync, sql: string, ...values: any[]) {
  return Number((sqlite.prepare(sql).get(...values) as any).value)
}

describe('Stage 5 economic-abuse hardening', () => {
  let sqlite: DatabaseSync
  let db: NodeDatabase

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:')
    seed(sqlite)
    db = new NodeDatabase(sqlite)
  })

  afterEach(() => sqlite.close())

  it('rejects a released operation key from an older usage period before provider work', async () => {
    const julyStart = '2026-07-01T00:00:00.000Z'
    const julyEnd = '2026-08-01T00:00:00.000Z'
    const julyTime = '2026-07-15T12:00:00.000Z'
    sqlite.prepare(`INSERT INTO usage_periods (
      id, user_id, plan_id, period_start, period_end, credits_granted, credits_consumed, created_at, updated_at
    ) VALUES ('period-july', ?, 'plan-free-v1', ?, ?, 3, 0, ?, ?)`)
      .run(USER, julyStart, julyEnd, julyTime, julyTime)

    sqlite.prepare(`INSERT INTO credit_reservations (
      id, user_id, usage_period_id, operation_key, route_id, operation_kind,
      credits, attempt_no, status, lease_expires_at, created_at, updated_at
    ) VALUES ('reservation-july', ?, 'period-july', 'old-period-key', 'discover', 'standalone',
      1, 1, 'running', '2026-07-15T12:15:00.000Z', ?, ?)`)
      .run(USER, julyTime, julyTime)
    sqlite.prepare(`UPDATE credit_reservations
      SET status='released', last_error_code='provider_failure', released_at=?, updated_at=?
      WHERE id='reservation-july' AND user_id=?`)
      .run(julyTime, julyTime, USER)

    const provider = vi.fn(async () => Response.json({ results: ['should-not-run'] }))
    const response = await withUsageEntitlement(post('/api/discover', 'old-period-key'), { DB: db }, user, provider)
    const body = await response.json() as any

    expect(response.status).toBe(409)
    expect(body.code).toBe('usage_operation_period_expired')
    expect(provider).not.toHaveBeenCalled()
    expect(scalar(sqlite, "SELECT COUNT(*) AS value FROM usage_periods WHERE user_id=? AND period_start='2026-08-01T00:00:00.000Z'", USER)).toBe(1)
    expect(scalar(sqlite, "SELECT credits_consumed AS value FROM usage_periods WHERE user_id=? AND period_start='2026-08-01T00:00:00.000Z'", USER)).toBe(0)
  })

  it('does not auto-refund useful full-analysis work while waiting for NCM continuation, even across period rollover', async () => {
    let nowMs = Date.parse(NOW)
    let ids = 0
    const repo = new UsageRepository(db, () => new Date(nowMs), () => `wait-id-${++ids}`)
    const started = await repo.begin({
      userId: USER,
      operationKey: 'wait-for-confirmation',
      routeId: 'analyze',
      operationKind: 'full_analysis',
    })
    expect(started.kind).toBe('started')
    if (started.kind !== 'started') throw new Error('expected started reservation')

    await repo.markContinuationReady(USER, started.reservation.id, {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ product: { name: 'Paleta', category: 'deportes' } }),
    })
    expect((await repo.usageView(USER)).period.creditsConsumed).toBe(1)

    // Cross midnight UTC into September. The new period must start clean, while
    // the useful August analysis remains charged in its original period.
    nowMs += 6 * 60 * 60 * 1000
    const later = await repo.usageView(USER)
    const reservation = await repo.getReservationForUser(USER, started.reservation.id)
    expect(later.period.start).toBe('2026-09-01T00:00:00.000Z')
    expect(later.period.creditsConsumed).toBe(0)
    expect(scalar(sqlite, "SELECT credits_consumed AS value FROM usage_periods WHERE id=?", started.reservation.usage_period_id)).toBe(1)
    expect(reservation?.status).toBe('continuation_ready')

    const claim = await repo.claimContinuation(USER, started.reservation.id)
    expect(claim.kind).toBe('started')
    expect((await repo.usageView(USER)).period.creditsConsumed).toBe(0)
    expect(scalar(sqlite, "SELECT credits_consumed AS value FROM usage_periods WHERE id=?", started.reservation.usage_period_id)).toBe(1)
  })

  it('caps refunded provider attempts so failures cannot create unlimited free external work', async () => {
    sqlite.prepare("UPDATE plans SET monthly_credits=1 WHERE code='free'").run()
    const provider = vi.fn(async () => Response.json({ error: 'provider unavailable' }, { status: 503 }))

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const response = await withUsageEntitlement(
        post('/api/discover', `refund-loop-${attempt}`),
        { DB: db },
        user,
        provider,
      )
      expect(response.status).toBe(503)
    }

    expect(provider).toHaveBeenCalledTimes(4)
    expect(scalar(sqlite, 'SELECT credits_consumed AS value FROM usage_periods WHERE user_id=?', USER)).toBe(0)
    expect(scalar(sqlite, "SELECT COUNT(*) AS value FROM credit_ledger WHERE user_id=? AND entry_type='consume'", USER)).toBe(4)
    expect(scalar(sqlite, "SELECT COUNT(*) AS value FROM credit_ledger WHERE user_id=? AND entry_type='refund'", USER)).toBe(4)

    const blocked = await withUsageEntitlement(post('/api/discover', 'refund-loop-5'), { DB: db }, user, provider)
    const body = await blocked.json() as any
    expect(blocked.status).toBe(429)
    expect(body.code).toBe('usage_attempt_limit_exhausted')
    expect(body.usage.period.creditsRemaining).toBe(1)
    expect(provider).toHaveBeenCalledTimes(4)
    expect(scalar(sqlite, 'SELECT credits_consumed AS value FROM usage_periods WHERE user_id=?', USER)).toBe(0)
  })

  it('fails closed instead of writing a refund ledger when the usage counter is inconsistent', async () => {
    let ids = 0
    const repo = new UsageRepository(db, () => new Date(NOW), () => `refund-id-${++ids}`)
    const started = await repo.begin({
      userId: USER,
      operationKey: 'refund-invariant',
      routeId: 'discover',
      operationKind: 'standalone',
    })
    expect(started.kind).toBe('started')
    if (started.kind !== 'started') throw new Error('expected started reservation')

    sqlite.prepare('UPDATE usage_periods SET credits_consumed=0 WHERE id=?').run(started.reservation.usage_period_id)

    await expect(repo.release(USER, started.reservation.id, 'forced-test-release'))
      .rejects.toThrow('reservation_refund_counter_invalid')
    expect(scalar(sqlite, "SELECT COUNT(*) AS value FROM credit_ledger WHERE user_id=? AND entry_type='refund'", USER)).toBe(0)
    expect((sqlite.prepare('SELECT status FROM credit_reservations WHERE id=?').get(started.reservation.id) as any).status).toBe('running')
  })
})
