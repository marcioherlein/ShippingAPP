import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthIdentity } from './auth'
import type { D1DatabaseLike, D1PreparedStatementLike, D1RunResultLike, D1Value } from './persistence/d1'
import { UsageRepository } from './persistence/usageRepository'
import { CREDITS_REMAINING_HEADER, USAGE_RESERVATION_HEADER, withUsageEntitlement } from './usage'

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

const USER_A = 'user-a-00000000-0000-4000-8000-000000000001'
const USER_B = 'user-b-00000000-0000-4000-8000-000000000001'
const NOW = '2026-08-31T20:30:00.000Z'
const userA: AuthIdentity = { kind: 'user', provider: 'clerk', subject: 'clerk-a', userId: USER_A }
const userB: AuthIdentity = { kind: 'user', provider: 'clerk', subject: 'clerk-b', userId: USER_B }
const service: AuthIdentity = { kind: 'service' }

function seed(sqlite: DatabaseSync) {
  for (const migration of ['0001_saas_foundation.sql', '0002_analysis_history.sql', '0003_usage_entitlements.sql', '0005_ncm_iterative_clarifications.sql']) {
    sqlite.exec(readFileSync(`migrations/${migration}`, 'utf8'))
  }
  const insert = sqlite.prepare("INSERT INTO users (id, auth_provider, auth_subject, created_at, updated_at) VALUES (?, 'test', ?, ?, ?)")
  insert.run(USER_A, 'subject-a', NOW, NOW)
  insert.run(USER_B, 'subject-b', NOW, NOW)
}

function req(path: string, init: RequestInit = {}) {
  return new Request(`https://shippingapp.test${path}`, init)
}

function meteredPost(path: string, key: string, body: unknown = {}) {
  return req(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify(body),
  })
}

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status })
}

function fullProduct() {
  return {
    name: 'Paleta Carbon Pro',
    category: 'deportes',
    material: 'carbono',
    functionText: 'paleta de padel',
    description: 'paleta profesional',
  }
}

function continuationRequest(reservationId: string, product = fullProduct()) {
  return req('/api/ncm-classify', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [USAGE_RESERVATION_HEADER]: reservationId,
    },
    body: JSON.stringify(product),
  })
}

function scalar(sqlite: DatabaseSync, sql: string, ...values: any[]) {
  return Number((sqlite.prepare(sql).get(...values) as any).value)
}

describe('Stage 5 atomic usage and entitlement boundary', () => {
  let sqlite: DatabaseSync
  let db: NodeDatabase
  let nowMs: number
  let idCounter: number
  const clock = () => new Date(nowMs)
  const randomId = () => `stage5-id-${++idCounter}`

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:')
    seed(sqlite)
    db = new NodeDatabase(sqlite)
    nowMs = Date.parse(NOW)
    idCounter = 0
  })

  afterEach(() => sqlite.close())

  it('lets only one of many parallel distinct operations cross a one-credit quota before provider work', async () => {
    sqlite.prepare("UPDATE plans SET monthly_credits = 1 WHERE code = 'free'").run()
    let providerCalls = 0
    const attempts = Array.from({ length: 12 }, (_, index) => withUsageEntitlement(
      meteredPost('/api/opportunity-search', `parallel-key-${String(index).padStart(2, '0')}`),
      { DB: db },
      userA,
      async () => {
        providerCalls += 1
        await new Promise((resolve) => setTimeout(resolve, 5))
        return jsonResponse({ results: [{ id: 'one' }] })
      },
    ))

    const responses = await Promise.all(attempts)
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1)
    expect(responses.filter((response) => response.status === 402)).toHaveLength(11)
    expect(providerCalls).toBe(1)
    expect(scalar(sqlite, "SELECT credits_consumed AS value FROM usage_periods WHERE user_id = ?", USER_A)).toBe(1)
    expect(scalar(sqlite, "SELECT COUNT(*) AS value FROM credit_ledger WHERE user_id = ? AND entry_type = 'consume'", USER_A)).toBe(1)
  })

  it('deduplicates the same operation key while the first provider call is still running', async () => {
    let releaseProvider!: () => void
    const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve })
    const provider = vi.fn(async () => {
      await providerGate
      return jsonResponse({ results: [{ id: 'same' }] })
    })

    const firstPromise = withUsageEntitlement(meteredPost('/api/discover', 'same-operation-key'), { DB: db }, userA, provider)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const second = await withUsageEntitlement(meteredPost('/api/discover', 'same-operation-key'), { DB: db }, userA, provider)
    expect(second.status).toBe(409)
    expect((await second.json() as any).code).toBe('operation_in_progress')
    releaseProvider()
    const first = await firstPromise
    expect(first.status).toBe(200)
    expect(provider).toHaveBeenCalledTimes(1)
    expect(scalar(sqlite, "SELECT COUNT(*) AS value FROM credit_reservations WHERE user_id = ?", USER_A)).toBe(1)
    expect(scalar(sqlite, "SELECT COUNT(*) AS value FROM credit_ledger WHERE user_id = ? AND entry_type = 'consume'", USER_A)).toBe(1)
  })

  it('replays a settled standalone operation without calling the provider or charging again', async () => {
    const provider = vi.fn(async () => jsonResponse({ results: [{ id: 'cached' }] }))
    const first = await withUsageEntitlement(meteredPost('/api/opportunity-search', 'replay-operation-1'), { DB: db }, userA, provider)
    const replay = await withUsageEntitlement(meteredPost('/api/opportunity-search', 'replay-operation-1'), { DB: db }, userA, provider)
    expect(first.status).toBe(200)
    expect(replay.status).toBe(200)
    expect(replay.headers.get('x-shippingapp-idempotency-replayed')).toBe('true')
    expect(await replay.json()).toEqual({ results: [{ id: 'cached' }] })
    expect(provider).toHaveBeenCalledTimes(1)
    expect(scalar(sqlite, "SELECT credits_consumed AS value FROM usage_periods WHERE user_id = ?", USER_A)).toBe(1)
  })

  it('charges exactly one credit across analyze plus its NCM continuation', async () => {
    const analyzeProvider = vi.fn(async () => jsonResponse({ product: fullProduct(), market: { status: 'live' } }))
    const analyze = await withUsageEntitlement(
      meteredPost('/api/analyze', 'full-analysis-one-credit', { url: 'https://www.alibaba.com/product-detail/1.html' }),
      { DB: db }, userA, analyzeProvider,
    )
    expect(analyze.status).toBe(200)
    const reservationId = analyze.headers.get(USAGE_RESERVATION_HEADER)
    expect(reservationId).toBeTruthy()
    expect(analyze.headers.get(CREDITS_REMAINING_HEADER)).toBe('2')
    expect(scalar(sqlite, "SELECT credits_consumed AS value FROM usage_periods WHERE user_id = ?", USER_A)).toBe(1)

    const ncmProvider = vi.fn(async () => jsonResponse({ candidate: { ncm: '9506.59.00' }, confidence: 'high' }))
    const ncm = await withUsageEntitlement(continuationRequest(String(reservationId)), { DB: db }, userA, ncmProvider)
    expect(ncm.status).toBe(200)
    expect(ncmProvider).toHaveBeenCalledTimes(1)
    expect(scalar(sqlite, "SELECT credits_consumed AS value FROM usage_periods WHERE user_id = ?", USER_A)).toBe(1)
    expect(scalar(sqlite, "SELECT COUNT(*) AS value FROM credit_ledger WHERE user_id = ? AND entry_type = 'consume'", USER_A)).toBe(1)
    expect((sqlite.prepare('SELECT status FROM credit_reservations WHERE id = ?').get(reservationId) as any).status).toBe('settled')
  })

  it('allows only one concurrent NCM continuation and replays the settled continuation later', async () => {
    const analyze = await withUsageEntitlement(
      meteredPost('/api/analyze', 'continuation-race-1'), { DB: db }, userA,
      async () => jsonResponse({ product: fullProduct() }),
    )
    const reservationId = String(analyze.headers.get(USAGE_RESERVATION_HEADER))

    let releaseNcm!: () => void
    const gate = new Promise<void>((resolve) => { releaseNcm = resolve })
    const ncmProvider = vi.fn(async () => {
      await gate
      return jsonResponse({ ncm: '9506.59.00' })
    })
    const firstPromise = withUsageEntitlement(continuationRequest(reservationId), { DB: db }, userA, ncmProvider)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const second = await withUsageEntitlement(continuationRequest(reservationId), { DB: db }, userA, ncmProvider)
    expect(second.status).toBe(409)
    expect((await second.json() as any).code).toBe('operation_in_progress')
    releaseNcm()
    expect((await firstPromise).status).toBe(200)

    const replay = await withUsageEntitlement(continuationRequest(reservationId), { DB: db }, userA, ncmProvider)
    expect(replay.status).toBe(200)
    expect(replay.headers.get('x-shippingapp-idempotency-replayed')).toBe('true')
    expect(ncmProvider).toHaveBeenCalledTimes(1)
    expect(scalar(sqlite, "SELECT COUNT(*) AS value FROM credit_ledger WHERE user_id = ? AND entry_type = 'consume'", USER_A)).toBe(1)
  })

  it('rejects a core-product pivot before provider work and does not manufacture an immediate refund', async () => {
    const analyze = await withUsageEntitlement(
      meteredPost('/api/analyze', 'continuation-binding-1'), { DB: db }, userA,
      async () => jsonResponse({ product: fullProduct() }),
    )
    const reservationId = String(analyze.headers.get(USAGE_RESERVATION_HEADER))
    const provider = vi.fn(async () => jsonResponse({ ncm: 'attacker' }))
    const manipulated = await withUsageEntitlement(
      continuationRequest(reservationId, { ...fullProduct(), name: 'Smartwatch AMOLED', category: 'electronics', material: 'material intentionally changed' }),
      { DB: db }, userA, provider,
    )
    expect(manipulated.status).toBe(409)
    expect((await manipulated.json() as any).code).toBe('usage_continuation_mismatch')
    expect(provider).not.toHaveBeenCalled()
    expect(scalar(sqlite, "SELECT credits_consumed AS value FROM usage_periods WHERE user_id = ?", USER_A)).toBe(1)
    expect((sqlite.prepare('SELECT status FROM credit_reservations WHERE id = ?').get(reservationId) as any).status).toBe('continuation_ready')
  })

  it('releases and refunds exactly once when provider/internal work fails', async () => {
    const failure = await withUsageEntitlement(
      meteredPost('/api/discover', 'provider-failure-1'), { DB: db }, userA,
      async () => jsonResponse({ error: 'provider unavailable' }, 503),
    )
    expect(failure.status).toBe(503)
    expect(scalar(sqlite, "SELECT credits_consumed AS value FROM usage_periods WHERE user_id = ?", USER_A)).toBe(0)
    expect(scalar(sqlite, "SELECT COUNT(*) AS value FROM credit_ledger WHERE user_id = ? AND entry_type = 'refund'", USER_A)).toBe(1)

    const row = sqlite.prepare("SELECT id FROM credit_reservations WHERE user_id = ? AND operation_key = 'provider-failure-1'").get(USER_A) as any
    const repo = new UsageRepository(db, clock, randomId)
    expect(await repo.release(USER_A, row.id, 'duplicate_release')).toBe(0)
    expect(scalar(sqlite, "SELECT COUNT(*) AS value FROM credit_ledger WHERE user_id = ? AND entry_type = 'refund'", USER_A)).toBe(1)
  })

  it('refunds a nominally-201 Watchlist refresh when no new trusted market evidence exists', async () => {
    const response = await withUsageEntitlement(
      meteredPost('/api/watchlist-refresh?id=item-a', 'watchlist-unavailable'), { DB: db }, userA,
      async () => jsonResponse({ item: { latestSnapshot: { marketStatus: 'unavailable', marketPriceArs: null } } }, 201),
    )
    expect(response.status).toBe(201)
    expect(scalar(sqlite, "SELECT credits_consumed AS value FROM usage_periods WHERE user_id = ?", USER_A)).toBe(0)
    expect(scalar(sqlite, "SELECT COUNT(*) AS value FROM credit_ledger WHERE user_id = ? AND entry_type = 'refund'", USER_A)).toBe(1)
  })

  it('keeps tenant usage and reservations owner-scoped', async () => {
    const repo = new UsageRepository(db, clock, randomId)
    const started = await repo.begin({ userId: USER_A, operationKey: 'tenant-private-op', routeId: 'discover', operationKind: 'standalone' })
    expect(started.kind).toBe('started')
    if (started.kind !== 'started') throw new Error('expected started')
    expect(await repo.getReservationForUser(USER_B, started.reservation.id)).toBeNull()
    expect(await repo.getOperationForUser(USER_B, 'tenant-private-op')).toBeNull()
    const usageB = await repo.usageView(USER_B)
    expect(usageB.period.creditsConsumed).toBe(0)
  })

  it('uses active server-owned subscription plans and ignores unusable subscription states', async () => {
    sqlite.prepare("INSERT INTO subscriptions (id, user_id, plan_id, provider, status, current_period_start, current_period_end, created_at, updated_at) VALUES ('sub-a', ?, 'plan-pro-v1', 'manual', 'active', '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', ?, ?)").run(USER_A, NOW, NOW)
    sqlite.prepare("INSERT INTO subscriptions (id, user_id, plan_id, provider, status, current_period_start, current_period_end, created_at, updated_at) VALUES ('sub-b', ?, 'plan-business-v1', 'manual', 'past_due', '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', ?, ?)").run(USER_B, NOW, NOW)
    const repo = new UsageRepository(db, clock, randomId)
    expect((await repo.usageView(USER_A)).plan).toMatchObject({ code: 'pro', monthlyCredits: 30 })
    expect((await repo.usageView(USER_B)).plan).toMatchObject({ code: 'free', monthlyCredits: 3 })
  })

  it('creates a fresh allowance at a calendar-month boundary for free users', async () => {
    const repo = new UsageRepository(db, clock, randomId)
    const august = await repo.begin({ userId: USER_A, operationKey: 'august-operation', routeId: 'discover', operationKind: 'standalone' })
    expect(august.kind).toBe('started')
    nowMs = Date.parse('2026-09-01T00:00:01.000Z')
    const september = await repo.usageView(USER_A)
    expect(september.period.start).toBe('2026-09-01T00:00:00.000Z')
    expect(september.period.creditsConsumed).toBe(0)
    expect(september.period.creditsRemaining).toBe(3)
    expect(scalar(sqlite, "SELECT COUNT(*) AS value FROM usage_periods WHERE user_id = ?", USER_A)).toBe(2)
  })

  it('releases stale interrupted work and can retry the same logical operation as a new attempt', async () => {
    const repo = new UsageRepository(db, clock, randomId)
    const first = await repo.begin({ userId: USER_A, operationKey: 'stale-retry-op', routeId: 'discover', operationKind: 'standalone' })
    expect(first.kind).toBe('started')
    nowMs += 16 * 60 * 1000
    const usageAfterLease = await repo.usageView(USER_A)
    expect(usageAfterLease.period.creditsConsumed).toBe(0)
    const retried = await repo.begin({ userId: USER_A, operationKey: 'stale-retry-op', routeId: 'discover', operationKind: 'standalone' })
    expect(retried.kind).toBe('started')
    if (retried.kind !== 'started') throw new Error('expected retry')
    expect(retried.reservation.attempt_no).toBe(2)
    expect((await repo.usageView(USER_A)).period.creditsConsumed).toBe(1)
    expect(scalar(sqlite, "SELECT COUNT(*) AS value FROM credit_ledger WHERE user_id = ? AND entry_type = 'consume'", USER_A)).toBe(2)
    expect(scalar(sqlite, "SELECT COUNT(*) AS value FROM credit_ledger WHERE user_id = ? AND entry_type = 'refund'", USER_A)).toBe(1)
  })

  it('lets the operational service identity run product probes without creating user usage rows, but not inspect /api/usage', async () => {
    const provider = vi.fn(async () => jsonResponse({ ok: true }))
    const bypass = await withUsageEntitlement(meteredPost('/api/discover', 'service-operation'), { DB: db }, service, provider)
    expect(bypass.status).toBe(200)
    expect(provider).toHaveBeenCalledTimes(1)
    expect(scalar(sqlite, 'SELECT COUNT(*) AS value FROM usage_periods')).toBe(0)
    expect(scalar(sqlite, 'SELECT COUNT(*) AS value FROM credit_reservations')).toBe(0)
    expect(scalar(sqlite, 'SELECT COUNT(*) AS value FROM credit_ledger')).toBe(0)

    const usage = await withUsageEntitlement(req('/api/usage'), { DB: db }, service, provider)
    expect(usage.status).toBe(401)
    expect(provider).toHaveBeenCalledTimes(1)
  })

  it('exposes only the authenticated users server-owned usage view and never reads client plan fields', async () => {
    sqlite.prepare("UPDATE plans SET monthly_credits = 1 WHERE code = 'free'").run()
    await withUsageEntitlement(
      meteredPost('/api/discover', 'server-plan-only', { plan: 'business', creditsRemaining: 999999, userId: USER_B }),
      { DB: db }, userA, async () => jsonResponse({ ok: true }),
    )
    const usageResponse = await withUsageEntitlement(req('/api/usage'), { DB: db }, userA, async () => jsonResponse({ shouldNotRun: true }))
    expect(usageResponse.status).toBe(200)
    const body = await usageResponse.json() as any
    expect(body.usage.plan).toMatchObject({ code: 'free', monthlyCredits: 1 })
    expect(body.usage.period).toMatchObject({ creditsGranted: 1, creditsConsumed: 1, creditsRemaining: 0 })
  })
})
