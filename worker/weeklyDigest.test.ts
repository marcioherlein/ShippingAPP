import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { D1DatabaseLike, D1PreparedStatementLike, D1RunResultLike, D1Value } from './persistence/d1'
import {
  buildWeeklyDigestForUser,
  digestLineFromSnapshots,
  digestSchedulerDryRun,
  runWeeklyDigestScheduler,
  weeklyDigestPeriod,
} from './weeklyDigest'

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
const USER_A = 'digest-user-a'
const USER_B = 'digest-user-b'
const USER_C = 'digest-user-c'

function migrate(sqlite: DatabaseSync) {
  for (const file of ['0001_saas_foundation.sql', '0002_analysis_history.sql', '0003_usage_entitlements.sql', '0004_weekly_digest_scheduler.sql']) {
    sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'))
  }
}

function addUser(sqlite: DatabaseSync, id: string, email = `${id}@example.com`, digestEnabled = 1, timezone = 'America/Argentina/Buenos_Aires') {
  sqlite.prepare("INSERT INTO users (id, auth_provider, auth_subject, email, display_name, created_at, updated_at) VALUES (?, 'test', ?, ?, ?, ?, ?)")
    .run(id, `sub-${id}`, email, id, NOW, NOW)
  sqlite.prepare('INSERT INTO email_preferences (user_id, digest_enabled, alerts_enabled, marketing_enabled, timezone, created_at, updated_at) VALUES (?, ?, 1, 0, ?, ?, ?)')
    .run(id, digestEnabled, timezone, NOW, NOW)
}

function addWatch(sqlite: DatabaseSync, userId: string, suffix: string, options: {
  title?: string
  latestAt?: string
  latestStatus?: string
  latestPrice?: number | null
  latestMargin?: number | null
  previousPrice?: number | null
  previousMargin?: number | null
  corruptLatest?: boolean
} = {}) {
  const itemId = `item-${userId}-${suffix}`
  const latestAt = options.latestAt ?? '2026-09-07T10:00:00.000Z'
  sqlite.prepare("INSERT INTO watchlist_items (id, user_id, analysis_id, title, source_url, active, metadata_json, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, 1, NULL, ?, ?)")
    .run(itemId, userId, options.title ?? `Producto ${suffix}`, `https://example.com/${userId}/${suffix}`, NOW, NOW)
  const previousPayload = JSON.stringify({ grossMarginPct: options.previousMargin ?? 30, provenance: { market: { status: 'live' } } })
  sqlite.prepare('INSERT INTO watchlist_snapshots (id, watchlist_item_id, observed_at, market_price_ars, landed_cost_ars, payload_json, idempotency_key, created_at) VALUES (?, ?, ?, ?, 100000, ?, ?, ?)')
    .run(`snap-prev-${userId}-${suffix}`, itemId, '2026-09-06T10:00:00.000Z', options.previousPrice ?? 200000, previousPayload, `prev-${userId}-${suffix}`, NOW)
  const latestPayload = options.corruptLatest
    ? '{not-json'
    : JSON.stringify({ grossMarginPct: options.latestMargin ?? 35, provenance: { market: { status: options.latestStatus ?? 'live' } } })
  sqlite.prepare('INSERT INTO watchlist_snapshots (id, watchlist_item_id, observed_at, market_price_ars, landed_cost_ars, payload_json, idempotency_key, created_at) VALUES (?, ?, ?, ?, 100000, ?, ?, ?)')
    .run(`snap-latest-${userId}-${suffix}`, itemId, latestAt, options.latestPrice === undefined ? 220000 : options.latestPrice, latestPayload, `latest-${userId}-${suffix}`, NOW)
  return itemId
}

function configuredEnv(db: NodeDatabase) {
  return {
    DB: db,
    EMAIL_SENDING_ENABLED: 'true',
    RESEND_API_KEY: 're_test_scheduler',
    EMAIL_FROM: 'ShippingAPP <mail@example.com>',
    EMAIL_UNSUBSCRIBE_SECRET: 'scheduler-secret-abcdefghijklmnopqrstuvwxyz-123456',
    EMAIL_PUBLIC_BASE_URL: 'https://shippingapp.example.com',
  }
}

function sentResult() {
  return Promise.resolve({ status: 'sent' as const, replayed: false })
}

describe('Stage 7 weekly digest scheduler', () => {
  let sqlite: DatabaseSync
  let db: NodeDatabase

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:')
    migrate(sqlite)
    db = new NodeDatabase(sqlite)
  })
  afterEach(() => sqlite.close())

  it('uses one deterministic weekly run key with Monday 11:00 UTC due time', () => {
    expect(weeklyDigestPeriod(new Date('2026-09-07T10:59:59Z'))).toMatchObject({
      runKey: 'weekly:2026-09-07',
      dueAt: '2026-09-07T11:00:00.000Z',
      due: false,
    })
    expect(weeklyDigestPeriod(new Date(NOW)).due).toBe(true)
    expect(weeklyDigestPeriod(new Date('2026-09-13T23:59:59Z')).runKey).toBe('weekly:2026-09-07')
  })

  it('does nothing and creates no run while production sending is disabled', async () => {
    addUser(sqlite, USER_A)
    addWatch(sqlite, USER_A, 'a')
    const result = await runWeeklyDigestScheduler({ ...configuredEnv(db), EMAIL_SENDING_ENABLED: 'false' }, { clock: () => new Date(NOW) })
    expect(result.status).toBe('disabled')
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM digest_runs').get()).toEqual({ count: 0 })
  })

  it('selects only digest-enabled users with email and an active watchlist', async () => {
    addUser(sqlite, USER_A)
    addUser(sqlite, USER_B, `${USER_B}@example.com`, 0)
    addUser(sqlite, USER_C)
    addWatch(sqlite, USER_A, 'a')
    addWatch(sqlite, USER_B, 'b')
    const dry = await digestSchedulerDryRun(configuredEnv(db), new Date(NOW))
    expect(dry.eligibleCount).toBe(1)
  })

  it('builds each digest only from that owner watchlist and never crosses tenants', async () => {
    addUser(sqlite, USER_A)
    addUser(sqlite, USER_B)
    addWatch(sqlite, USER_A, 'a', { title: 'SECRETO DE A' })
    addWatch(sqlite, USER_B, 'b', { title: 'SECRETO DE B' })
    const captured = new Map<string, string[]>()

    const result = await runWeeklyDigestScheduler(configuredEnv(db), {
      clock: () => new Date(NOW),
      sendEmail: async (_env, input) => {
        captured.set(input.userId, [...(input.templateInput?.summaryLines ?? [])])
        return { status: 'sent', replayed: false }
      },
    })

    expect(result.status).toBe('completed')
    expect(captured.get(USER_A)?.join(' ')).toContain('SECRETO DE A')
    expect(captured.get(USER_A)?.join(' ')).not.toContain('SECRETO DE B')
    expect(captured.get(USER_B)?.join(' ')).toContain('SECRETO DE B')
    expect(captured.get(USER_B)?.join(' ')).not.toContain('SECRETO DE A')
  })

  it('is idempotent when cron fires twice after a completed run', async () => {
    addUser(sqlite, USER_A)
    addWatch(sqlite, USER_A, 'a')
    let sends = 0
    const deps = {
      clock: () => new Date(NOW),
      sendEmail: async () => { sends += 1; return { status: 'sent' as const, replayed: false } },
    }
    const first = await runWeeklyDigestScheduler(configuredEnv(db), deps)
    const second = await runWeeklyDigestScheduler(configuredEnv(db), deps)
    expect(first.status).toBe('completed')
    expect(second.status).toBe('completed')
    expect(sends).toBe(1)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM digest_runs').get()).toEqual({ count: 1 })
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM digest_run_recipients').get()).toEqual({ count: 1 })
  })

  it('continues bounded batches across invocations instead of loading every user at once', async () => {
    for (let i = 0; i < 12; i += 1) {
      const id = `batch-user-${String(i).padStart(2, '0')}`
      addUser(sqlite, id)
      addWatch(sqlite, id, 'x')
    }
    let sends = 0
    const deps = {
      clock: () => new Date(NOW),
      batchSize: 5,
      sendEmail: async () => { sends += 1; return { status: 'sent' as const, replayed: false } },
    }
    const one = await runWeeklyDigestScheduler(configuredEnv(db), deps)
    const two = await runWeeklyDigestScheduler(configuredEnv(db), deps)
    const three = await runWeeklyDigestScheduler(configuredEnv(db), deps)
    expect(one.status).toBe('running')
    expect(two.status).toBe('running')
    expect(three.status).toBe('completed')
    expect(sends).toBe(12)
    expect(three.summary?.invocationCount).toBe(3)
  })

  it('retries a transient provider failure without resending recipients already sent', async () => {
    addUser(sqlite, USER_A)
    addUser(sqlite, USER_B)
    addWatch(sqlite, USER_A, 'a')
    addWatch(sqlite, USER_B, 'b')
    const attempts = new Map<string, number>()
    const deps = {
      clock: () => new Date(NOW),
      sendEmail: async (_env: any, input: any) => {
        const count = (attempts.get(input.userId) ?? 0) + 1
        attempts.set(input.userId, count)
        if (input.userId === USER_A && count === 1) return { status: 'failed' as const, replayed: false, code: 'email_provider_temporarily_unavailable' }
        return { status: 'sent' as const, replayed: count > 1 }
      },
    }
    expect((await runWeeklyDigestScheduler(configuredEnv(db), deps)).status).toBe('running')
    expect((await runWeeklyDigestScheduler(configuredEnv(db), deps)).status).toBe('completed')
    expect(attempts.get(USER_A)).toBe(2)
    expect(attempts.get(USER_B)).toBe(1)
  })

  it('contains a throwing user, retries it at most three times, and closes the week partial', async () => {
    addUser(sqlite, USER_A)
    addUser(sqlite, USER_B)
    addWatch(sqlite, USER_A, 'a')
    addWatch(sqlite, USER_B, 'b')
    let bSends = 0
    const deps = {
      clock: () => new Date(NOW),
      maxAttempts: 3,
      buildDigest: async (database: D1DatabaseLike, userId: string, timezone: string, now: Date) => {
        if (userId === USER_A) throw new Error('malicious/corrupt snapshot')
        return buildWeeklyDigestForUser(database, userId, timezone, now)
      },
      sendEmail: async (_env: any, input: any) => {
        if (input.userId === USER_B) bSends += 1
        return { status: 'sent' as const, replayed: false }
      },
    }
    expect((await runWeeklyDigestScheduler(configuredEnv(db), deps)).status).toBe('running')
    expect((await runWeeklyDigestScheduler(configuredEnv(db), deps)).status).toBe('running')
    const final = await runWeeklyDigestScheduler(configuredEnv(db), deps)
    expect(final.status).toBe('partial')
    expect(final.summary?.failed).toBe(1)
    expect(bSends).toBe(1)
  })

  it('never promotes unavailable, stale or corrupt snapshot data into a real movement claim', () => {
    const base = {
      id: 's', watchlist_item_id: 'i', observed_at: '2026-09-07T10:00:00.000Z', market_price_ars: 220000,
      landed_cost_ars: 100000, payload_json: JSON.stringify({ grossMarginPct: 35, provenance: { market: { status: 'live' } } }),
      idempotency_key: 'k', created_at: NOW,
    }
    const previous = { ...base, id: 'p', observed_at: '2026-09-06T10:00:00.000Z', market_price_ars: 200000, idempotency_key: 'p' }
    const unavailable = { ...base, payload_json: JSON.stringify({ provenance: { market: { status: 'unavailable' } } }) }
    const corrupt = { ...base, payload_json: '{bad-json' }
    const stale = { ...base, observed_at: '2026-08-01T10:00:00.000Z' }

    expect(digestLineFromSnapshots({ title: 'A', latest: unavailable, previous, timezone: 'UTC', now: new Date(NOW) })).toContain('no se informa movimiento')
    expect(digestLineFromSnapshots({ title: 'A', latest: corrupt, previous, timezone: 'UTC', now: new Date(NOW) })).toContain('no se informa movimiento')
    expect(digestLineFromSnapshots({ title: 'A', latest: stale, previous, timezone: 'UTC', now: new Date(NOW) })).toContain('sin actualización reciente')
    expect(digestLineFromSnapshots({ title: 'A', latest: base, previous, timezone: 'UTC', now: new Date(NOW) })).toContain('precio +10.0%')
  })

  it('keeps dry-run operational output aggregate-only with no user ids, emails or product titles', async () => {
    addUser(sqlite, USER_A)
    addWatch(sqlite, USER_A, 'secret', { title: 'TOP SECRET PRODUCT' })
    const dry = await digestSchedulerDryRun(configuredEnv(db), new Date(NOW))
    const serialized = JSON.stringify(dry)
    expect(serialized).not.toContain(USER_A)
    expect(serialized).not.toContain('@example.com')
    expect(serialized).not.toContain('TOP SECRET PRODUCT')
    expect(dry.eligibleCount).toBe(1)
  })
})
