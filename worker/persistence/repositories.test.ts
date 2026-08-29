import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { D1DatabaseLike, D1PreparedStatementLike, D1RunResultLike, D1Value } from './d1'
import { SaasRepository } from './repositories'

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

const FIXED_NOW = new Date('2026-08-29T18:30:00.000Z')
const PERIOD_START = '2026-08-01T00:00:00.000Z'
const PERIOD_END = '2026-09-01T00:00:00.000Z'

function ids(prefix: string) { return `${prefix}-00000000-0000-4000-8000-000000000001` }

describe('SaaS D1 persistence foundation', () => {
  let sqlite: DatabaseSync
  let repo: SaasRepository

  beforeEach(async () => {
    sqlite = new DatabaseSync(':memory:')
    sqlite.exec(readFileSync('migrations/0001_saas_foundation.sql', 'utf8'))
    repo = new SaasRepository(new NodeDatabase(sqlite), () => FIXED_NOW)
    await repo.createUser({ id: ids('user-a'), authProvider: 'test', authSubject: 'subject-a', email: 'a@example.test' })
    await repo.createUser({ id: ids('user-b'), authProvider: 'test', authSubject: 'subject-b', email: 'b@example.test' })
    await repo.createPlan({ id: ids('plan'), code: 'foundation', name: 'Foundation', monthlyCredits: 10 })
  })

  afterEach(() => sqlite.close())

  it('creates all Stage 1 tables with foreign keys enabled', () => {
    const names = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row: any) => row.name)
    expect(names).toEqual(['analyses', 'billing_events', 'credit_ledger', 'email_events', 'email_preferences', 'plans', 'subscriptions', 'usage_periods', 'users', 'watchlist_items', 'watchlist_snapshots'])
    expect(sqlite.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
  })

  it('rejects duplicate provider identities and stores SQL injection payloads as data', async () => {
    await expect(repo.createUser({ id: ids('dupe'), authProvider: 'test', authSubject: 'subject-a' })).rejects.toThrow()
    const injection = "x'); DROP TABLE users; --"
    await repo.createUser({ id: ids('inject'), authProvider: 'test', authSubject: injection })
    expect((await repo.getUserById(ids('inject')))?.auth_subject).toBe(injection)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({ count: 3 })
  })

  it('initializes a usage period idempotently and rejects semantic collisions', async () => {
    const first = await repo.initializeUsagePeriod({ id: ids('period-a'), userId: ids('user-a'), planId: ids('plan'), periodStart: PERIOD_START, periodEnd: PERIOD_END, creditsGranted: 10 })
    const replay = await repo.initializeUsagePeriod({ id: ids('period-replay'), userId: ids('user-a'), planId: ids('plan'), periodStart: PERIOD_START, periodEnd: PERIOD_END, creditsGranted: 10 })
    expect(replay.id).toBe(first.id)
    await expect(repo.initializeUsagePeriod({ id: ids('period-bad'), userId: ids('user-a'), planId: ids('plan'), periodStart: PERIOD_START, periodEnd: PERIOD_END, creditsGranted: 999 })).rejects.toThrow('idempotency collision')
  })

  it('enforces tenant ownership for credit-ledger usage and analysis references', async () => {
    await repo.initializeUsagePeriod({ id: ids('period-a'), userId: ids('user-a'), planId: ids('plan'), periodStart: PERIOD_START, periodEnd: PERIOD_END, creditsGranted: 10 })
    await repo.createAnalysis({ id: ids('analysis-a'), userId: ids('user-a'), idempotencyKey: 'analysis-a', input: { product: 'racket' } })
    await expect(repo.addCreditLedgerEntry({ id: ids('ledger-cross'), userId: ids('user-b'), usagePeriodId: ids('period-a'), analysisId: ids('analysis-a'), entryType: 'consume', deltaCredits: -1, idempotencyKey: 'cross-user' })).rejects.toThrow()
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM credit_ledger').get()).toEqual({ count: 0 })
  })

  it('enforces tenant ownership when a watchlist references an analysis', async () => {
    await repo.createAnalysis({ id: ids('analysis-a'), userId: ids('user-a'), input: { product: 'charger' } })
    await expect(repo.createWatchlistItem({ id: ids('watch-cross'), userId: ids('user-b'), analysisId: ids('analysis-a'), title: 'Cross user', sourceUrl: 'https://www.alibaba.com/product-detail/cross.html' })).rejects.toThrow()
  })

  it('provides parameterized CRUD boundaries for watchlists and email preferences', async () => {
    await repo.createWatchlistItem({ id: ids('watch-a'), userId: ids('user-a'), title: 'Racket', sourceUrl: 'https://www.alibaba.com/product-detail/racket.html', metadata: { target: 20 } })
    expect(await repo.deleteWatchlistItem(ids('user-b'), ids('watch-a'))).toBe(0)
    expect(await repo.deleteWatchlistItem(ids('user-a'), ids('watch-a'))).toBe(1)

    const first = await repo.upsertEmailPreferences({ userId: ids('user-a'), digestEnabled: true, alertsEnabled: true, marketingEnabled: false, timezone: 'America/Argentina/Buenos_Aires' })
    const updated = await repo.upsertEmailPreferences({ userId: ids('user-a'), digestEnabled: false, alertsEnabled: true, marketingEnabled: false, timezone: 'UTC' })
    expect(first.digest_enabled).toBe(1)
    expect(updated.digest_enabled).toBe(0)
    expect(updated.timezone).toBe('UTC')
  })

  it('makes billing provider events replay-safe and detects payload substitution', async () => {
    const payloadHash = 'a'.repeat(64)
    const first = await repo.recordBillingEvent({ id: ids('billing-a'), provider: 'testpay', providerEventId: 'evt_1', eventType: 'subscription.updated', payloadSha256: payloadHash })
    const replay = await repo.recordBillingEvent({ id: ids('billing-replay'), provider: 'testpay', providerEventId: 'evt_1', eventType: 'subscription.updated', payloadSha256: payloadHash })
    expect(replay.id).toBe(first.id)
    await expect(repo.recordBillingEvent({ id: ids('billing-tampered'), provider: 'testpay', providerEventId: 'evt_1', eventType: 'subscription.updated', payloadSha256: 'b'.repeat(64) })).rejects.toThrow('replay mismatch')
  })

  it('rejects invalid foreign keys and oversized values before persistence', async () => {
    await expect(repo.createSubscription({ id: ids('sub-bad'), userId: ids('missing-user'), planId: ids('plan'), provider: 'testpay', status: 'active' })).rejects.toThrow()
    await expect(repo.createWatchlistItem({ id: ids('watch-big'), userId: ids('user-a'), title: 'x'.repeat(241), sourceUrl: 'https://example.test' })).rejects.toThrow('title')
    await expect(repo.createAnalysis({ id: ids('analysis-big'), userId: ids('user-a'), input: { value: 'x'.repeat(262144) } })).rejects.toThrow('analysis input')
  })

  it('preserves already-applied schema when a later migration transaction fails', () => {
    expect(() => sqlite.exec(`BEGIN; CREATE TABLE migration_probe (id INTEGER PRIMARY KEY); INSERT INTO migration_probe VALUES (1); INSERT INTO definitely_missing_table VALUES (1); COMMIT;`)).toThrow()
    try { sqlite.exec('ROLLBACK') } catch { /* already rolled back by host */ }
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='migration_probe'").get()).toEqual({ count: 0 })
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='users'").get()).toEqual({ count: 1 })
  })
})
