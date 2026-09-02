import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmailMessage, EmailProvider, EmailSendResult } from './emailProvider'
import { sendApplicationEmail } from './emailService'
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

class ConditionalFailureStatement implements D1PreparedStatementLike {
  constructor(private readonly inner: D1PreparedStatementLike, private readonly failRun: boolean) {}
  bind(...values: D1Value[]) { return new ConditionalFailureStatement(this.inner.bind(...values), this.failRun) }
  first<T>() { return this.inner.first<T>() }
  all<T>() { return this.inner.all<T>() }
  async run(): Promise<D1RunResultLike> {
    if (this.failRun) throw new Error('simulated-sensitive-d1-mark-sent-failure')
    return this.inner.run()
  }
}

class FailMarkSentDatabase implements D1DatabaseLike {
  constructor(private readonly base: D1DatabaseLike) {}
  prepare(sql: string) {
    const isMarkSent = /UPDATE\s+email_events\s+SET\s+status\s*=\s*'sent'/i.test(sql)
    return new ConditionalFailureStatement(this.base.prepare(sql), isMarkSent)
  }
}

class FakeProvider implements EmailProvider {
  readonly name = 'fake-resend'
  readonly configured = true
  readonly send = vi.fn(async (_message: EmailMessage, options: { idempotencyKey: string }): Promise<EmailSendResult> => ({
    messageId: `provider-${options.idempotencyKey.replace(/^shippingapp\//, '')}`,
  }))
}

const USER = 'user-email-ambiguity'
const START = Date.parse('2026-09-01T12:00:00.000Z')

function seed(sqlite: DatabaseSync) {
  for (const migration of ['0001_saas_foundation.sql', '0002_analysis_history.sql', '0003_usage_entitlements.sql']) {
    sqlite.exec(readFileSync(`migrations/${migration}`, 'utf8'))
  }
  const now = new Date(START).toISOString()
  sqlite.prepare("INSERT INTO users (id, auth_provider, auth_subject, email, display_name, created_at, updated_at) VALUES (?, 'clerk', ?, ?, ?, ?, ?)")
    .run(USER, 'clerk-email-ambiguity', 'owner@example.com', 'Owner', now, now)
}

function env(db: D1DatabaseLike) {
  return {
    DB: db,
    EMAIL_SENDING_ENABLED: 'true',
    EMAIL_DELIVERY_MODE: 'all',
    EMAIL_FROM: 'ShippingAPP <onboarding@resend.dev>',
    EMAIL_APP_NAME: 'ShippingAPP',
  }
}

describe('Stage 6 delivery acknowledgement ambiguity', () => {
  let sqlite: DatabaseSync
  let db: NodeDatabase
  let provider: FakeProvider
  let nowMs: number
  const clock = () => new Date(nowMs)

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:')
    seed(sqlite)
    db = new NodeDatabase(sqlite)
    provider = new FakeProvider()
    nowMs = START
  })

  afterEach(() => sqlite.close())

  it('never marks provider-accepted mail failed when only the sent-state persistence write fails', async () => {
    const key = 'provider-success-d1-ack-failure-001'
    const first = await sendApplicationEmail(env(new FailMarkSentDatabase(db)), {
      userId: USER,
      templateKey: 'billing',
      templateInput: { planName: 'Pro', billingStatus: 'active' },
      idempotencyKey: key,
    }, { provider, clock, randomId: () => 'email-event-ambiguity-1' })

    expect(first).toEqual({
      status: 'queued',
      replayed: false,
      eventId: 'email-event-ambiguity-1',
      code: 'email_delivery_state_unconfirmed',
    })
    expect(provider.send).toHaveBeenCalledTimes(1)
    expect(provider.send.mock.calls[0][1]).toEqual({ idempotencyKey: `shippingapp/${key}` })

    const storedAfterFailure = sqlite.prepare(
      'SELECT status, provider, provider_message_id, metadata_json FROM email_events WHERE idempotency_key = ?',
    ).get(key) as any
    expect(storedAfterFailure.status).toBe('queued')
    expect(storedAfterFailure.provider).toBeNull()
    expect(storedAfterFailure.provider_message_id).toBeNull()
    expect(String(storedAfterFailure.metadata_json)).not.toContain('failureCode')
    expect(String(storedAfterFailure.metadata_json)).not.toContain('simulated-sensitive')

    const immediateReplay = await sendApplicationEmail(env(db), {
      userId: USER,
      templateKey: 'billing',
      templateInput: { planName: 'Pro', billingStatus: 'active' },
      idempotencyKey: key,
    }, { provider, clock, randomId: () => 'must-not-create-another-event' })
    expect(immediateReplay).toMatchObject({ status: 'queued', replayed: true, eventId: 'email-event-ambiguity-1' })
    expect(provider.send).toHaveBeenCalledTimes(1)

    nowMs += 121_000
    const safeRetry = await sendApplicationEmail(env(db), {
      userId: USER,
      templateKey: 'billing',
      templateInput: { planName: 'Pro', billingStatus: 'active' },
      idempotencyKey: key,
    }, { provider, clock, randomId: () => 'must-not-create-another-event' })

    expect(safeRetry).toMatchObject({ status: 'sent', replayed: true, eventId: 'email-event-ambiguity-1' })
    expect(provider.send).toHaveBeenCalledTimes(2)
    expect(provider.send.mock.calls[1][1]).toEqual(provider.send.mock.calls[0][1])
    const finalStored = sqlite.prepare('SELECT status, provider_message_id FROM email_events WHERE idempotency_key = ?').get(key) as any
    expect(finalStored.status).toBe('sent')
    expect(finalStored.provider_message_id).toBe(`provider-${key}`)
  })
})
