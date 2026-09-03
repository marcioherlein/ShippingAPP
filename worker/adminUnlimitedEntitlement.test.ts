import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { D1DatabaseLike, D1PreparedStatementLike, D1RunResultLike, D1Value } from './persistence/d1'
import { UsageRepository } from './persistence/usageRepository'

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

const NOW = '2026-09-03T12:00:00.000Z'
const ADMIN_ID = 'admin-user-00000000-0000-4000-8000-000000000001'

function migrate(sqlite: DatabaseSync) {
  for (const migration of [
    '0001_saas_foundation.sql',
    '0002_analysis_history.sql',
    '0003_usage_entitlements.sql',
    '0005_ncm_iterative_clarifications.sql',
    '0006_admin_unlimited_usage.sql',
  ]) {
    sqlite.exec(readFileSync(`migrations/${migration}`, 'utf8'))
  }
}

describe('administrator QA entitlement', () => {
  it('grants the admin plan when Clerk email is synchronized after migrations', async () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      migrate(sqlite)
      sqlite.prepare(`INSERT INTO users (
        id, auth_provider, auth_subject, email, created_at, updated_at
      ) VALUES (?, 'clerk', 'admin-subject', ?, ?, ?)`).run(
        ADMIN_ID,
        'marciofabrizio@gmail.com',
        NOW,
        NOW,
      )

      const repo = new UsageRepository(new NodeDatabase(sqlite), () => new Date(NOW), () => 'admin-period')
      const usage = await repo.usageView(ADMIN_ID)

      expect(usage.plan.code).toBe('admin')
      expect(usage.plan.name).toBe('Admin')
      expect(usage.plan.monthlyCredits).toBe(1_000_000_000)
      expect(usage.period.creditsGranted).toBe(1_000_000_000)
      expect(usage.period.creditsRemaining).toBe(1_000_000_000)
    } finally {
      sqlite.close()
    }
  })

  it('upgrades an already-synchronized matching user when the migration is applied later', async () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      for (const migration of [
        '0001_saas_foundation.sql',
        '0002_analysis_history.sql',
        '0003_usage_entitlements.sql',
        '0005_ncm_iterative_clarifications.sql',
      ]) sqlite.exec(readFileSync(`migrations/${migration}`, 'utf8'))

      sqlite.prepare(`INSERT INTO users (
        id, auth_provider, auth_subject, email, created_at, updated_at
      ) VALUES (?, 'clerk', 'admin-subject', ?, ?, ?)`).run(
        ADMIN_ID,
        'marciofabrizio@gmail.com',
        NOW,
        NOW,
      )

      sqlite.exec(readFileSync('migrations/0006_admin_unlimited_usage.sql', 'utf8'))
      const repo = new UsageRepository(new NodeDatabase(sqlite), () => new Date(NOW), () => 'admin-period')
      const usage = await repo.usageView(ADMIN_ID)
      expect(usage.plan.code).toBe('admin')
      expect(usage.period.creditsRemaining).toBeGreaterThan(999_000_000)
    } finally {
      sqlite.close()
    }
  })
})
