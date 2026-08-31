import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleWatchlist } from './watchlist'
import { TRUSTED_AUTH_KIND_HEADER, TRUSTED_USER_ID_HEADER } from './auth'
import type { ArgentinaMarketResult } from './marketTypes'
import type { D1DatabaseLike, D1PreparedStatementLike, D1RunResultLike, D1Value } from './persistence/d1'

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
const ANALYSIS_A = 'analysis-a-0000-4000-8000-000000000001'
const ANALYSIS_B = 'analysis-b-0000-4000-8000-000000000001'
const NOW = '2026-08-31T18:00:00.000Z'

function seed(db: DatabaseSync) {
  db.exec(readFileSync('migrations/0001_saas_foundation.sql', 'utf8'))
  db.exec(readFileSync('migrations/0002_analysis_history.sql', 'utf8'))
  const insertUser = db.prepare(`INSERT INTO users (id, auth_provider, auth_subject, created_at, updated_at) VALUES (?, 'test', ?, ?, ?)`)
  insertUser.run(USER_A, 'subject-a', NOW, NOW)
  insertUser.run(USER_B, 'subject-b', NOW, NOW)
  insertCompletedAnalysis(db, USER_A, ANALYSIS_A, 'Paleta Carbon Pro', 'https://supplier.test/paleta-carbon', 100_000)
  insertCompletedAnalysis(db, USER_B, ANALYSIS_B, 'Auricular B', 'https://supplier.test/auricular-b', 80_000)
}

function insertCompletedAnalysis(db: DatabaseSync, userId: string, id: string, name: string, sourceUrl: string, marketPriceArs: number) {
  const result = {
    analysis: {
      product: { name, category: 'deportes' },
      sourceUrl,
      market: {
        estimatedPriceArs: marketPriceArs,
        source: 'Argentina market benchmark',
        details: {
          status: 'live',
          source: 'direct-retailers',
          query: name,
          comparableCount: 6,
          confidence: 0.86,
          comparables: [{ id: 'cmp-1', title: `${name} local`, priceArs: marketPriceArs, permalink: 'https://retailer.test/item' }],
        },
      },
      fx: { arsPerUsd: 1000, observedAt: NOW },
      customs: { ncmCandidate: '9506.59.00' },
    },
    pipelineSummary: { unitCostUsd: 50, totalCostUsd: 5000 },
  }
  db.prepare(`INSERT INTO analyses (
    id, user_id, idempotency_key, status, input_json, result_json, created_at, updated_at, deleted_at
  ) VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, NULL)`).run(
    id,
    userId,
    `history:${id}`,
    JSON.stringify({ productName: name, sourceUrl }),
    JSON.stringify(result),
    NOW,
    NOW,
  )
}

function userRequest(userId: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set(TRUSTED_AUTH_KIND_HEADER, 'user')
  headers.set(TRUSTED_USER_ID_HEADER, userId)
  return new Request(`https://shippingapp.test${path}`, { ...init, headers })
}

function serviceRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set(TRUSTED_AUTH_KIND_HEADER, 'service')
  return new Request(`https://shippingapp.test${path}`, { ...init, headers })
}

function addRequest(userId: string, analysisId: string, extra: Record<string, unknown> = {}) {
  return userRequest(userId, '/api/watchlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ analysisId, ...extra }),
  })
}

function liveMarket(priceArs: number): ArgentinaMarketResult {
  return {
    status: 'live',
    query: 'Paleta Carbon Pro',
    categoryId: null,
    categoryName: null,
    rawCount: 10,
    comparableCount: 5,
    effectivePriceCount: 3,
    p25Ars: priceArs * 0.9,
    medianArs: priceArs,
    p75Ars: priceArs * 1.1,
    suggestedPriceArs: priceArs,
    confidence: 0.9,
    source: 'trusted-test-market',
    priceQuality: 'mixed_sale_and_search_price',
    comparables: [{
      id: 'trusted-1',
      title: 'Comparable real',
      priceArs,
      listedPriceArs: priceArs,
      priceSource: 'search_price',
      score: 0.95,
      reason: 'strong semantic match',
      permalink: 'https://retailer.test/trusted-1',
    }],
    warnings: [],
  }
}

describe('Stage 4 watchlist + trusted snapshots HTTP boundary', () => {
  let sqlite: DatabaseSync
  let db: NodeDatabase
  let nowMs: number
  const clock = () => new Date(nowMs)

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:')
    seed(sqlite)
    db = new NodeDatabase(sqlite)
    nowMs = Date.parse(NOW)
  })

  afterEach(() => sqlite.close())

  it('derives owner, title, source and initial prices from the private server-owned analysis only', async () => {
    const response = await handleWatchlist(addRequest(USER_A, ANALYSIS_A, {
      userId: USER_B,
      title: 'INJECTED',
      sourceUrl: 'https://attacker.test',
      marketPriceArs: 1,
      landedCostArs: 1,
      grossMarginPct: 999,
    }), { DB: db }, { clock })

    expect(response.status).toBe(201)
    const body = await response.json() as any
    expect(body.item.title).toBe('Paleta Carbon Pro')
    expect(body.item.sourceUrl).toBe('https://supplier.test/paleta-carbon')
    expect(body.item.latestSnapshot.marketPriceArs).toBe(100_000)
    expect(body.item.latestSnapshot.landedCostArs).toBe(50_000)
    expect(body.item.latestSnapshot.grossMarginPct).toBe(50)

    const stored = sqlite.prepare('SELECT user_id, title, source_url FROM watchlist_items').get() as any
    expect(stored).toEqual({ user_id: USER_A, title: 'Paleta Carbon Pro', source_url: 'https://supplier.test/paleta-carbon' })
  })

  it('returns the same 404 for a foreign analysis and a nonexistent analysis', async () => {
    const cross = await handleWatchlist(addRequest(USER_A, ANALYSIS_B), { DB: db }, { clock })
    const missing = await handleWatchlist(addRequest(USER_A, 'analysis-does-not-exist'), { DB: db }, { clock })
    expect(cross.status).toBe(404)
    expect(missing.status).toBe(404)
    expect(await cross.text()).toBe(await missing.text())
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM watchlist_items').get()).toEqual({ count: 0 })
  })

  it('deduplicates concurrent add requests and creates one initial snapshot', async () => {
    const responses = await Promise.all(Array.from({ length: 6 }, () => handleWatchlist(addRequest(USER_A, ANALYSIS_A), { DB: db }, { clock })))
    expect(responses.every((response) => response.status === 201)).toBe(true)
    const ids = new Set(await Promise.all(responses.map(async (response) => (await response.json() as any).item.id)))
    expect(ids.size).toBe(1)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM watchlist_items WHERE user_id = ?').get(USER_A)).toEqual({ count: 1 })
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM watchlist_snapshots').get()).toEqual({ count: 1 })
  })

  it('prevents list, detail, delete and refresh access across tenants with indistinguishable 404s', async () => {
    const created = await handleWatchlist(addRequest(USER_B, ANALYSIS_B), { DB: db }, { clock })
    const itemId = (await created.json() as any).item.id

    const listA = await handleWatchlist(userRequest(USER_A, '/api/watchlist'), { DB: db }, { clock })
    expect((await listA.json() as any).items).toEqual([])

    const crossGet = await handleWatchlist(userRequest(USER_A, `/api/watchlist-item?id=${encodeURIComponent(itemId)}`), { DB: db }, { clock })
    const missingGet = await handleWatchlist(userRequest(USER_A, '/api/watchlist-item?id=missing-item'), { DB: db }, { clock })
    expect(crossGet.status).toBe(404)
    expect(await crossGet.text()).toBe(await missingGet.text())

    const crossDelete = await handleWatchlist(userRequest(USER_A, `/api/watchlist-item?id=${encodeURIComponent(itemId)}`, { method: 'DELETE' }), { DB: db }, { clock })
    expect(crossDelete.status).toBe(404)
    expect((sqlite.prepare('SELECT active FROM watchlist_items WHERE id = ?').get(itemId) as any).active).toBe(1)

    const crossRefresh = await handleWatchlist(userRequest(USER_A, `/api/watchlist-refresh?id=${encodeURIComponent(itemId)}`, {
      method: 'POST', headers: { 'idempotency-key': 'cross-tenant-refresh' },
    }), { DB: db }, { clock, marketLookup: async () => liveMarket(999_999) })
    expect(crossRefresh.status).toBe(404)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM watchlist_snapshots WHERE watchlist_item_id = ?').get(itemId)).toEqual({ count: 1 })
  })

  it('refreshes with server market evidence, ignores spoofed body prices and calculates real change', async () => {
    const created = await handleWatchlist(addRequest(USER_A, ANALYSIS_A), { DB: db }, { clock })
    const itemId = (await created.json() as any).item.id
    nowMs += 60_000
    const marketLookup = vi.fn(async () => liveMarket(140_000))

    const refreshed = await handleWatchlist(userRequest(USER_A, `/api/watchlist-refresh?id=${encodeURIComponent(itemId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'refresh-trusted-001' },
      body: JSON.stringify({ marketPriceArs: 1, landedCostArs: 1, grossMarginPct: -999 }),
    }), { DB: db }, { clock, marketLookup })

    expect(refreshed.status).toBe(201)
    const body = await refreshed.json() as any
    expect(body.replayed).toBe(false)
    expect(body.item.latestSnapshot.marketPriceArs).toBe(140_000)
    expect(body.item.latestSnapshot.landedCostArs).toBe(50_000)
    expect(body.item.latestSnapshot.marketSource).toBe('trusted-test-market')
    expect(body.item.changes.marketPricePct).toBeCloseTo(40)
    expect(marketLookup).toHaveBeenCalledTimes(1)
  })

  it('replays a refresh idempotency key without a second provider call or snapshot', async () => {
    const created = await handleWatchlist(addRequest(USER_A, ANALYSIS_A), { DB: db }, { clock })
    const itemId = (await created.json() as any).item.id
    const marketLookup = vi.fn(async () => liveMarket(125_000))

    nowMs += 60_000
    const first = await handleWatchlist(userRequest(USER_A, `/api/watchlist-refresh?id=${encodeURIComponent(itemId)}`, {
      method: 'POST', headers: { 'idempotency-key': 'same-refresh-key' },
    }), { DB: db }, { clock, marketLookup })
    expect(first.status).toBe(201)

    nowMs += 3_600_000
    const replay = await handleWatchlist(userRequest(USER_A, `/api/watchlist-refresh?id=${encodeURIComponent(itemId)}`, {
      method: 'POST', headers: { 'idempotency-key': 'same-refresh-key' },
    }), { DB: db }, { clock, marketLookup })
    expect(replay.status).toBe(200)
    expect((await replay.json() as any).replayed).toBe(true)
    expect(marketLookup).toHaveBeenCalledTimes(1)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM watchlist_snapshots WHERE watchlist_item_id = ?').get(itemId)).toEqual({ count: 2 })
  })

  it('records provider outage as unavailable instead of inventing a market move', async () => {
    const created = await handleWatchlist(addRequest(USER_A, ANALYSIS_A), { DB: db }, { clock })
    const itemId = (await created.json() as any).item.id
    nowMs += 60_000

    const refreshed = await handleWatchlist(userRequest(USER_A, `/api/watchlist-refresh?id=${encodeURIComponent(itemId)}`, {
      method: 'POST', headers: { 'idempotency-key': 'provider-outage-1' },
    }), { DB: db }, { clock, marketLookup: async () => { throw new Error('upstream timeout secret=should-not-escape') } })

    expect(refreshed.status).toBe(201)
    const body = await refreshed.json() as any
    expect(body.item.latestSnapshot.marketPriceArs).toBeNull()
    expect(body.item.latestSnapshot.marketStatus).toBe('unavailable')
    expect(body.item.changes).toEqual({ marketPricePct: null, landedCostPct: null, grossMarginPoints: null })
    expect(body.item.previousSnapshot.marketPriceArs).toBe(100_000)
  })

  it('keeps watchlist monitoring independent from History after the original analysis is soft-deleted', async () => {
    const created = await handleWatchlist(addRequest(USER_A, ANALYSIS_A), { DB: db }, { clock })
    const itemId = (await created.json() as any).item.id
    sqlite.prepare('UPDATE analyses SET deleted_at = ?, updated_at = ? WHERE id = ?').run('2026-08-31T18:10:00.000Z', '2026-08-31T18:10:00.000Z', ANALYSIS_A)
    nowMs += 120_000

    const refreshed = await handleWatchlist(userRequest(USER_A, `/api/watchlist-refresh?id=${encodeURIComponent(itemId)}`, {
      method: 'POST', headers: { 'idempotency-key': 'after-history-delete' },
    }), { DB: db }, { clock, marketLookup: async () => liveMarket(130_000) })
    expect(refreshed.status).toBe(201)
    expect((await refreshed.json() as any).item.latestSnapshot.marketPriceArs).toBe(130_000)
  })

  it('supports remove and re-add without losing snapshot history or creating duplicate items', async () => {
    const created = await handleWatchlist(addRequest(USER_A, ANALYSIS_A), { DB: db }, { clock })
    const firstId = (await created.json() as any).item.id

    const removed = await handleWatchlist(userRequest(USER_A, `/api/watchlist-item?id=${encodeURIComponent(firstId)}`, { method: 'DELETE' }), { DB: db }, { clock })
    expect(removed.status).toBe(204)

    nowMs += 60_000
    const readded = await handleWatchlist(addRequest(USER_A, ANALYSIS_A), { DB: db }, { clock })
    const secondId = (await readded.json() as any).item.id
    expect(secondId).toBe(firstId)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM watchlist_items WHERE user_id = ?').get(USER_A)).toEqual({ count: 1 })
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM watchlist_snapshots WHERE watchlist_item_id = ?').get(firstId)).toEqual({ count: 1 })
    expect((sqlite.prepare('SELECT active FROM watchlist_items WHERE id = ?').get(firstId) as any).active).toBe(1)
  })

  it('fails closed for anonymous/service identity and invalid refresh idempotency', async () => {
    const anonymous = await handleWatchlist(new Request('https://shippingapp.test/api/watchlist'), { DB: db }, { clock })
    expect(anonymous.status).toBe(401)

    const service = await handleWatchlist(serviceRequest('/api/watchlist'), { DB: db }, { clock })
    expect(service.status).toBe(401)

    const created = await handleWatchlist(addRequest(USER_A, ANALYSIS_A), { DB: db }, { clock })
    const itemId = (await created.json() as any).item.id
    const invalid = await handleWatchlist(userRequest(USER_A, `/api/watchlist-refresh?id=${encodeURIComponent(itemId)}`, { method: 'POST' }), { DB: db }, { clock })
    expect(invalid.status).toBe(400)
    expect((await invalid.json() as any).code).toBe('invalid_idempotency_key')
  })
})
