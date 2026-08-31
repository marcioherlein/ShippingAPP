import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { handleAnalysisHistory } from './analysisHistory'
import { TRUSTED_AUTH_KIND_HEADER, TRUSTED_USER_ID_HEADER } from './auth'
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
const NOW = '2026-08-31T10:00:00.000Z'

function seed(db: DatabaseSync) {
  db.exec(readFileSync('migrations/0001_saas_foundation.sql', 'utf8'))
  db.exec(readFileSync('migrations/0002_analysis_history.sql', 'utf8'))
  const insert = db.prepare(`INSERT INTO users (id, auth_provider, auth_subject, created_at, updated_at) VALUES (?, 'test', ?, ?, ?)`)
  insert.run(USER_A, 'subject-a', NOW, NOW)
  insert.run(USER_B, 'subject-b', NOW, NOW)
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

async function save(db: D1DatabaseLike, userId: string, key: string, productName = 'Paleta') {
  return handleAnalysisHistory(userRequest(userId, '/api/history', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: key,
      userId: USER_B,
      input: { productName, injectedOwner: USER_B },
      result: { analysis: { product: { name: productName }, sourceUrl: 'https://example.test/product' }, pipelineSummary: { totalCostUsd: 1500 } },
    }),
  }), { DB: db })
}

describe('Stage 3 private analysis history HTTP boundary', () => {
  let sqlite: DatabaseSync
  let db: NodeDatabase

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:')
    seed(sqlite)
    db = new NodeDatabase(sqlite)
  })

  afterEach(() => sqlite.close())

  it('derives ownership only from trusted auth identity and ignores injected userId fields', async () => {
    const response = await save(db, USER_A, 'owner-proof')
    expect(response.status).toBe(201)
    const stored = sqlite.prepare('SELECT user_id, status FROM analyses').get() as any
    expect(stored).toEqual({ user_id: USER_A, status: 'completed' })

    const listB = await handleAnalysisHistory(userRequest(USER_B, '/api/history'), { DB: db })
    expect(listB.status).toBe(200)
    expect((await listB.json() as any).items).toEqual([])
  })

  it('returns indistinguishable 404s for missing and cross-tenant detail IDs', async () => {
    const created = await save(db, USER_A, 'private-detail')
    const id = (await created.json() as any).item.id

    const cross = await handleAnalysisHistory(userRequest(USER_B, `/api/history-item?id=${encodeURIComponent(id)}`), { DB: db })
    const missing = await handleAnalysisHistory(userRequest(USER_B, '/api/history-item?id=analysis-does-not-exist'), { DB: db })
    expect(cross.status).toBe(404)
    expect(missing.status).toBe(404)
    expect(await cross.text()).toBe(await missing.text())
  })

  it('prevents another tenant from deleting history and lets the owner soft-delete it', async () => {
    const created = await save(db, USER_A, 'private-delete')
    const id = (await created.json() as any).item.id

    const crossDelete = await handleAnalysisHistory(userRequest(USER_B, `/api/history-item?id=${encodeURIComponent(id)}`, { method: 'DELETE' }), { DB: db })
    expect(crossDelete.status).toBe(404)
    expect((sqlite.prepare('SELECT deleted_at FROM analyses WHERE id = ?').get(id) as any).deleted_at).toBeNull()

    const ownerDelete = await handleAnalysisHistory(userRequest(USER_A, `/api/history-item?id=${encodeURIComponent(id)}`, { method: 'DELETE' }), { DB: db })
    expect(ownerDelete.status).toBe(204)
    const afterDelete = await handleAnalysisHistory(userRequest(USER_A, `/api/history-item?id=${encodeURIComponent(id)}`), { DB: db })
    expect(afterDelete.status).toBe(404)
  })

  it('does not treat the operational service identity as an end-user history identity', async () => {
    await save(db, USER_A, 'service-separation')
    const list = await handleAnalysisHistory(serviceRequest('/api/history'), { DB: db })
    expect(list.status).toBe(401)
    expect((await list.json() as any).code).toBe('unauthorized')
  })

  it('paginates without leaking another users rows', async () => {
    await save(db, USER_A, 'page-a-1', 'A1')
    await new Promise((resolve) => setTimeout(resolve, 2))
    await save(db, USER_A, 'page-a-2', 'A2')
    await save(db, USER_B, 'page-b-1', 'B1')

    const first = await handleAnalysisHistory(userRequest(USER_A, '/api/history?limit=1'), { DB: db })
    const page1 = await first.json() as any
    expect(page1.items).toHaveLength(1)
    expect(page1.items[0].productName).not.toBe('B1')
    expect(typeof page1.nextCursor).toBe('string')

    const second = await handleAnalysisHistory(userRequest(USER_A, `/api/history?limit=1&cursor=${encodeURIComponent(page1.nextCursor)}`), { DB: db })
    const page2 = await second.json() as any
    expect(page2.items).toHaveLength(1)
    expect(page2.items[0].productName).not.toBe('B1')
    expect(new Set([...page1.items, ...page2.items].map((item: any) => item.productName))).toEqual(new Set(['A1', 'A2']))
  })

  it('replays a completed-save retry without creating a duplicate record', async () => {
    const first = await save(db, USER_A, 'network-retry')
    const replay = await save(db, USER_A, 'network-retry')
    expect(first.status).toBe(201)
    expect(replay.status).toBe(201)
    expect((await first.json() as any).item.id).toBe((await replay.json() as any).item.id)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM analyses WHERE user_id = ?').get(USER_A)).toEqual({ count: 1 })
  })

  it('fails closed on anonymous access and malformed save payloads', async () => {
    const anonymous = await handleAnalysisHistory(new Request('https://shippingapp.test/api/history'), { DB: db })
    expect(anonymous.status).toBe(401)

    const malformed = await handleAnalysisHistory(userRequest(USER_A, '/api/history', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not-json',
    }), { DB: db })
    expect(malformed.status).toBe(400)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM analyses').get()).toEqual({ count: 0 })
  })
})
