import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureAuthUser } from './authUser'
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

describe('authenticated user mapping', () => {
  let sqlite: DatabaseSync
  let db: NodeDatabase

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:')
    sqlite.exec(readFileSync('migrations/0001_saas_foundation.sql', 'utf8'))
    db = new NodeDatabase(sqlite)
  })

  afterEach(() => sqlite.close())

  it('maps the same Clerk subject idempotently even when first requests race', async () => {
    const [first, second] = await Promise.all([
      ensureAuthUser(db, { id: 'candidate-a', provider: 'clerk', subject: 'user_clerk_123', now: new Date('2026-08-29T20:00:00Z') }),
      ensureAuthUser(db, { id: 'candidate-b', provider: 'clerk', subject: 'user_clerk_123', now: new Date('2026-08-29T20:00:00Z') }),
    ])

    expect(second.id).toBe(first.id)
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM users WHERE auth_provider='clerk' AND auth_subject='user_clerk_123'").get()).toEqual({ count: 1 })
  })

  it('never uses email as the external identity key', async () => {
    const first = await ensureAuthUser(db, { id: 'user-a', provider: 'clerk', subject: 'clerk-a' })
    const second = await ensureAuthUser(db, { id: 'user-b', provider: 'clerk', subject: 'clerk-b' })
    expect(first.id).not.toBe(second.id)
  })
})
