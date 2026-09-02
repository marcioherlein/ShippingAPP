import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmailMessage, EmailProvider, EmailSendResult } from './emailProvider'
import { emailRuntimeStatus, sendApplicationEmail } from './emailService'
import type { D1DatabaseLike, D1PreparedStatementLike, D1RunResultLike, D1Value } from './persistence/d1'
import { runWeeklyDigestScheduler } from './weeklyDigest'

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

class FakeProvider implements EmailProvider {
  readonly name = 'fake-resend'
  readonly configured = true
  readonly send = vi.fn(async (_message: EmailMessage, options: { idempotencyKey: string }): Promise<EmailSendResult> => ({ messageId: `msg-${options.idempotencyKey}` }))
}

const NOW = '2026-09-07T12:00:00.000Z'
const USER_A = 'stage8-canary-a'
const USER_B = 'stage8-canary-b'

function migrate(sqlite: DatabaseSync) {
  for (const file of ['0001_saas_foundation.sql', '0002_analysis_history.sql', '0003_usage_entitlements.sql', '0004_weekly_digest_scheduler.sql']) {
    sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'))
  }
}

function addUser(sqlite: DatabaseSync, id: string) {
  sqlite.prepare("INSERT INTO users (id, auth_provider, auth_subject, email, display_name, created_at, updated_at) VALUES (?, 'test', ?, ?, ?, ?, ?)")
    .run(id, `sub-${id}`, `${id}@example.com`, id, NOW, NOW)
  sqlite.prepare('INSERT INTO email_preferences (user_id, digest_enabled, alerts_enabled, marketing_enabled, timezone, created_at, updated_at) VALUES (?, 1, 1, 0, ?, ?, ?)')
    .run(id, 'UTC', NOW, NOW)
  sqlite.prepare("INSERT INTO watchlist_items (id, user_id, analysis_id, title, source_url, active, metadata_json, created_at, updated_at) VALUES (?, ?, NULL, 'Producto', ?, 1, NULL, ?, ?)")
    .run(`item-${id}`, id, `https://example.com/${id}`, NOW, NOW)
}

function env(db: NodeDatabase, mode: 'off' | 'canary' | 'all', canaryIds = '') {
  return {
    DB: db,
    EMAIL_SENDING_ENABLED: mode === 'off' ? 'false' : 'true',
    EMAIL_DELIVERY_MODE: mode,
    EMAIL_CANARY_USER_IDS: canaryIds,
    EMAIL_FROM: 'ShippingAPP <mail@example.com>',
    EMAIL_PUBLIC_BASE_URL: 'https://app.example.com',
    EMAIL_UNSUBSCRIBE_SECRET: 'stage8-canary-unsubscribe-secret-0000000000000000',
  }
}

describe('Stage 8 canary delivery boundary', () => {
  let sqlite: DatabaseSync
  let db: NodeDatabase
  let provider: FakeProvider

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:')
    migrate(sqlite)
    db = new NodeDatabase(sqlite)
    provider = new FakeProvider()
    addUser(sqlite, USER_A)
    addUser(sqlite, USER_B)
  })

  afterEach(() => sqlite.close())

  it('sends only to an allowlisted server-owned user and creates no event for a blocked user', async () => {
    const canaryEnv = env(db, 'canary', USER_A)
    const allowed = await sendApplicationEmail(canaryEnv, {
      userId: USER_A,
      templateKey: 'billing',
      idempotencyKey: 'stage8-canary-allowed-001',
    }, { provider, clock: () => new Date(NOW), randomId: () => 'event-a' })
    const blocked = await sendApplicationEmail(canaryEnv, {
      userId: USER_B,
      templateKey: 'billing',
      idempotencyKey: 'stage8-canary-blocked-001',
    }, { provider, clock: () => new Date(NOW), randomId: () => 'event-b' })

    expect(allowed.status).toBe('sent')
    expect(blocked).toEqual({ status: 'not_configured', replayed: false, code: 'email_canary_recipient_required' })
    expect(provider.send).toHaveBeenCalledTimes(1)
    expect(provider.send.mock.calls[0][0].to).toBe(`${USER_A}@example.com`)
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM email_events WHERE user_id = ?").get(USER_B)).toEqual({ count: 0 })
  })

  it('keeps global scheduler permission false throughout canary mode and exposes aggregates only', () => {
    const status = emailRuntimeStatus(env(db, 'canary', `${USER_A},${USER_B}`))
    expect(status).toMatchObject({
      sendingEnabled: false,
      deliveryMode: 'canary',
      canaryDeliveryEnabled: true,
      canaryConfigured: true,
      canaryUserCount: 2,
    })
    const serialized = JSON.stringify(status)
    expect(serialized).not.toContain(USER_A)
    expect(serialized).not.toContain(USER_B)
  })

  it('prevents the hourly digest scheduler from creating a run or sending during canary', async () => {
    const result = await runWeeklyDigestScheduler(env(db, 'canary', USER_A), {
      clock: () => new Date(NOW),
      sendEmail: async () => { throw new Error('scheduler must remain paused during canary') },
    })
    expect(result).toMatchObject({ status: 'disabled', code: 'email_sending_disabled' })
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM digest_runs').get()).toEqual({ count: 0 })
  })

  it('requires an explicit second transition to all before the global scheduler is enabled', () => {
    expect(emailRuntimeStatus(env(db, 'off')).sendingEnabled).toBe(false)
    expect(emailRuntimeStatus(env(db, 'canary', USER_A)).sendingEnabled).toBe(false)
    expect(emailRuntimeStatus(env(db, 'all')).toMatchObject({ sendingEnabled: true, deliveryMode: 'all', canaryDeliveryEnabled: false }))
  })
})
