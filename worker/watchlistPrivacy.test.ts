import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { TRUSTED_AUTH_KIND_HEADER, TRUSTED_USER_ID_HEADER } from './auth'
import { handleWatchlist } from './watchlist'
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

const USER = 'privacy-user-0000-4000-8000-000000000001'
const ANALYSIS = 'privacy-analysis-4000-8000-000000000001'
const NOW = '2026-08-31T18:30:00.000Z'

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set(TRUSTED_AUTH_KIND_HEADER, 'user')
  headers.set(TRUSTED_USER_ID_HEADER, USER)
  return new Request(`https://shippingapp.test${path}`, { ...init, headers })
}

describe('Stage 4 watchlist provider-error privacy', () => {
  const databases: DatabaseSync[] = []
  afterEach(() => databases.splice(0).forEach((db) => db.close()))

  it('persists and returns only a generic provider failure, never the raw upstream message', async () => {
    const sqlite = new DatabaseSync(':memory:')
    databases.push(sqlite)
    sqlite.exec(readFileSync('migrations/0001_saas_foundation.sql', 'utf8'))
    sqlite.exec(readFileSync('migrations/0002_analysis_history.sql', 'utf8'))
    sqlite.prepare(`INSERT INTO users (id, auth_provider, auth_subject, created_at, updated_at) VALUES (?, 'test', 'privacy-subject', ?, ?)`).run(USER, NOW, NOW)
    sqlite.prepare(`INSERT INTO analyses (
      id, user_id, idempotency_key, status, input_json, result_json, created_at, updated_at, deleted_at
    ) VALUES (?, ?, 'privacy-history', 'completed', ?, ?, ?, ?, NULL)`).run(
      ANALYSIS,
      USER,
      JSON.stringify({ productName: 'Producto privado', sourceUrl: 'https://supplier.test/private' }),
      JSON.stringify({
        analysis: {
          product: { name: 'Producto privado', category: 'test' },
          sourceUrl: 'https://supplier.test/private',
          market: { estimatedPriceArs: 100000, source: 'baseline', details: { status: 'live', source: 'baseline', comparables: [] } },
          fx: { arsPerUsd: 1000, observedAt: NOW },
        },
        pipelineSummary: { unitCostUsd: 50 },
      }),
      NOW,
      NOW,
    )
    const db = new NodeDatabase(sqlite)
    const clock = () => new Date(NOW)

    const added = await handleWatchlist(request('/api/watchlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ analysisId: ANALYSIS }),
    }), { DB: db }, { clock })
    expect(added.status).toBe(201)
    const itemId = (await added.json() as any).item.id

    const rawProviderMessage = 'upstream timeout api_key=TOP-SECRET-123 customer_email=private@example.test'
    const refreshed = await handleWatchlist(request(`/api/watchlist-refresh?id=${encodeURIComponent(itemId)}`, {
      method: 'POST',
      headers: { 'idempotency-key': 'privacy-refresh-001' },
    }), { DB: db }, {
      clock,
      marketLookup: async () => { throw new Error(rawProviderMessage) },
    })

    expect(refreshed.status).toBe(201)
    const responseText = await refreshed.text()
    expect(responseText).not.toContain('TOP-SECRET-123')
    expect(responseText).not.toContain('private@example.test')
    expect(responseText).not.toContain('upstream timeout')
    expect(responseText).toContain('Market provider unavailable.')

    const persisted = sqlite.prepare(`SELECT payload_json FROM watchlist_snapshots WHERE idempotency_key LIKE 'refresh:%'`).get() as { payload_json: string }
    expect(persisted.payload_json).not.toContain('TOP-SECRET-123')
    expect(persisted.payload_json).not.toContain('private@example.test')
    expect(persisted.payload_json).not.toContain('upstream timeout')
    expect(persisted.payload_json).toContain('Market provider unavailable.')
  })
})
