import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { D1DatabaseLike, D1PreparedStatementLike, D1RunResultLike, D1Value } from './d1'
import { AnalysisHistoryRepository, parseAnalysisHistoryJson } from './analysisHistoryRepository'

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

function applyMigrations(db: DatabaseSync) {
  db.exec(readFileSync('migrations/0001_saas_foundation.sql', 'utf8'))
  db.exec(readFileSync('migrations/0002_analysis_history.sql', 'utf8'))
}

function seedUsers(db: DatabaseSync) {
  const insert = db.prepare(`INSERT INTO users (id, auth_provider, auth_subject, created_at, updated_at) VALUES (?, 'test', ?, ?, ?)`)
  insert.run(USER_A, 'subject-a', NOW, NOW)
  insert.run(USER_B, 'subject-b', NOW, NOW)
}

function analysisId(n: number) {
  return `analysis-${String(n).padStart(2, '0')}-0000-4000-8000-000000000001`
}

describe('Stage 3 private analysis history repository', () => {
  let sqlite: DatabaseSync
  let db: NodeDatabase

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:')
    applyMigrations(sqlite)
    seedUsers(sqlite)
    db = new NodeDatabase(sqlite)
  })

  afterEach(() => sqlite.close())

  it('stores a completed analysis once and makes network retry idempotent', async () => {
    const repo = new AnalysisHistoryRepository(db, () => new Date(NOW))
    const first = await repo.saveCompleted({
      id: analysisId(1), userId: USER_A, idempotencyKey: 'save-1',
      input: { product: 'paleta', purpose: 'resale' }, result: { totalCostUsd: 1200 },
    })
    const replay = await repo.saveCompleted({
      id: analysisId(2), userId: USER_A, idempotencyKey: 'save-1',
      input: { product: 'paleta', purpose: 'resale' }, result: { totalCostUsd: 1200 },
    })

    expect(replay.id).toBe(first.id)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM analyses').get()).toEqual({ count: 1 })
  })

  it('rejects idempotency-key reuse with substituted analysis content', async () => {
    const repo = new AnalysisHistoryRepository(db, () => new Date(NOW))
    await repo.saveCompleted({ id: analysisId(1), userId: USER_A, idempotencyKey: 'same-key', input: { product: 'A' }, result: { total: 1 } })
    await expect(repo.saveCompleted({ id: analysisId(2), userId: USER_A, idempotencyKey: 'same-key', input: { product: 'B' }, result: { total: 999 } }))
      .rejects.toThrow('idempotency collision')
  })

  it('scopes list and detail lookups to the authenticated owner', async () => {
    const repo = new AnalysisHistoryRepository(db, () => new Date(NOW))
    await repo.saveCompleted({ id: analysisId(1), userId: USER_A, idempotencyKey: 'a-1', input: { product: 'private-a' }, result: { secret: 'A' } })
    await repo.saveCompleted({ id: analysisId(2), userId: USER_B, idempotencyKey: 'b-1', input: { product: 'private-b' }, result: { secret: 'B' } })

    const listA = await repo.listVisibleForUser(USER_A)
    expect(listA.map((row) => row.id)).toEqual([analysisId(1)])
    expect(await repo.getVisibleForUser(USER_B, analysisId(1))).toBeNull()
    expect(await repo.getVisibleForUser(USER_A, analysisId(2))).toBeNull()
  })

  it('soft-deletes only the owners record and preserves the underlying row for future references', async () => {
    const repo = new AnalysisHistoryRepository(db, () => new Date(NOW))
    await repo.saveCompleted({ id: analysisId(1), userId: USER_A, idempotencyKey: 'delete-a', input: { product: 'A' }, result: { total: 1 } })

    expect(await repo.softDeleteForUser(USER_B, analysisId(1))).toBe(0)
    expect(await repo.getVisibleForUser(USER_A, analysisId(1))).not.toBeNull()
    expect(await repo.softDeleteForUser(USER_A, analysisId(1))).toBe(1)
    expect(await repo.getVisibleForUser(USER_A, analysisId(1))).toBeNull()
    expect(await repo.listVisibleForUser(USER_A)).toEqual([])

    const stored = sqlite.prepare('SELECT status, deleted_at FROM analyses WHERE id = ?').get(analysisId(1)) as any
    expect(stored.status).toBe('completed')
    expect(stored.deleted_at).toBe(NOW)
  })

  it('orders newest first and paginates with an owner-scoped keyset cursor', async () => {
    const times = [
      '2026-08-31T10:00:00.000Z',
      '2026-08-31T10:01:00.000Z',
      '2026-08-31T10:02:00.000Z',
    ]
    let index = 0
    const repo = new AnalysisHistoryRepository(db, () => new Date(times[Math.min(index++, times.length - 1)]))
    await repo.saveCompleted({ id: analysisId(1), userId: USER_A, idempotencyKey: 'page-1', input: { n: 1 }, result: { n: 1 } })
    await repo.saveCompleted({ id: analysisId(2), userId: USER_A, idempotencyKey: 'page-2', input: { n: 2 }, result: { n: 2 } })
    await repo.saveCompleted({ id: analysisId(3), userId: USER_A, idempotencyKey: 'page-3', input: { n: 3 }, result: { n: 3 } })

    const firstPage = await repo.listVisibleForUser(USER_A, { limit: 2 })
    expect(firstPage.map((row) => row.id)).toEqual([analysisId(3), analysisId(2)])
    const tail = firstPage.at(-1)!
    const secondPage = await repo.listVisibleForUser(USER_A, { limit: 2, before: { createdAt: tail.created_at, id: tail.id } })
    expect(secondPage.map((row) => row.id)).toEqual([analysisId(1)])
  })

  it('keeps malicious product text inert as JSON data and never executes it as SQL', async () => {
    const repo = new AnalysisHistoryRepository(db, () => new Date(NOW))
    const malicious = `</script><img src=x onerror=alert(1)>'); DROP TABLE users; --`
    const row = await repo.saveCompleted({ id: analysisId(1), userId: USER_A, idempotencyKey: 'malicious', input: { productName: malicious }, result: { note: malicious } })
    const parsed = parseAnalysisHistoryJson(row)
    expect((parsed.input as any).productName).toBe(malicious)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({ count: 2 })
  })

  it('rejects oversized completed history payloads before persistence', async () => {
    const repo = new AnalysisHistoryRepository(db, () => new Date(NOW))
    await expect(repo.saveCompleted({
      id: analysisId(1), userId: USER_A, idempotencyKey: 'too-big',
      input: { value: 'x'.repeat(262144) }, result: { ok: true },
    })).rejects.toThrow('analysis input')
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM analyses').get()).toEqual({ count: 0 })
  })
})
