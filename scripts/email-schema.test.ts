import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('Stage 6 D1 email schema invariants', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
    for (const migration of ['0001_saas_foundation.sql', '0002_analysis_history.sql', '0003_usage_entitlements.sql']) {
      db.exec(readFileSync(`migrations/${migration}`, 'utf8'))
    }
  })

  afterEach(() => db.close())

  it('keeps preferences strictly user-owned with privacy-safe defaults', () => {
    const fks = db.prepare("PRAGMA foreign_key_list('email_preferences')").all() as any[]
    expect(fks).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'users', from: 'user_id', to: 'id', on_delete: 'CASCADE' }),
    ]))
    const sql = String((db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='email_preferences'").get() as any).sql)
    expect(sql).toContain('digest_enabled INTEGER NOT NULL DEFAULT 1')
    expect(sql).toContain('alerts_enabled INTEGER NOT NULL DEFAULT 1')
    expect(sql).toContain('marketing_enabled INTEGER NOT NULL DEFAULT 0')
    expect(sql).toContain("timezone TEXT NOT NULL DEFAULT 'UTC'")
  })

  it('enforces one logical email event and one provider message mapping', () => {
    const indexes = db.prepare("PRAGMA index_list('email_events')").all() as any[]
    const uniqueIndexes = indexes.filter((index) => Number(index.unique) === 1)
    const columns = (name: string) => (db.prepare(`PRAGMA index_info('${name.replaceAll("'", "''")}')`).all() as any[])
      .sort((a, b) => Number(a.seqno) - Number(b.seqno)).map((row) => row.name)
    expect(uniqueIndexes.some((index) => JSON.stringify(columns(String(index.name))) === JSON.stringify(['idempotency_key']))).toBe(true)

    const providerIndex = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_email_events_provider_message'").get() as any
    expect(String(providerIndex.sql)).toContain('UNIQUE INDEX')
    expect(String(providerIndex.sql)).toContain('provider, provider_message_id')
  })

  it('restricts event status to known lifecycle states and cascades user deletion', () => {
    const sql = String((db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='email_events'").get() as any).sql)
    for (const status of ['queued', 'sent', 'delivered', 'failed', 'suppressed']) expect(sql).toContain(`'${status}'`)
    const fks = db.prepare("PRAGMA foreign_key_list('email_events')").all() as any[]
    expect(fks).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'users', from: 'user_id', to: 'id', on_delete: 'SET NULL' }),
    ]))
  })
})
