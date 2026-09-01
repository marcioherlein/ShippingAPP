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

class FakeProvider implements EmailProvider {
  readonly name = 'fake-resend'
  readonly configured = true
  readonly send = vi.fn(async (_message: EmailMessage, options: { idempotencyKey: string }): Promise<EmailSendResult> => ({
    messageId: `provider-${options.idempotencyKey.replace(/^shippingapp\//, '')}`,
  }))
}

const USER_A = 'user-a-email-service'
const USER_B = 'user-b-email-service'
const NOW = '2026-09-01T12:00:00.000Z'
const SECRET = 'stage-6-unsubscribe-secret-0000000000000000000000000000'

function seed(sqlite: DatabaseSync) {
  for (const migration of ['0001_saas_foundation.sql', '0002_analysis_history.sql', '0003_usage_entitlements.sql']) {
    sqlite.exec(readFileSync(`migrations/${migration}`, 'utf8'))
  }
  const insert = sqlite.prepare("INSERT INTO users (id, auth_provider, auth_subject, email, display_name, created_at, updated_at) VALUES (?, 'clerk', ?, ?, ?, ?, ?)")
  insert.run(USER_A, 'clerk-a', 'owner-a@example.com', 'Owner A', NOW, NOW)
  insert.run(USER_B, 'clerk-b', 'owner-b@example.com', 'Owner B', NOW, NOW)
}

function eventCount(sqlite: DatabaseSync, key: string) {
  return Number((sqlite.prepare('SELECT COUNT(*) AS count FROM email_events WHERE idempotency_key = ?').get(key) as any).count)
}

function baseEnv(db: D1DatabaseLike) {
  return {
    DB: db,
    EMAIL_SENDING_ENABLED: 'true',
    EMAIL_UNSUBSCRIBE_SECRET: SECRET,
    EMAIL_PUBLIC_BASE_URL: 'https://shippingapp.test',
    EMAIL_FROM: 'ShippingAPP <onboarding@resend.dev>',
    EMAIL_APP_NAME: 'ShippingAPP',
  }
}

describe('Stage 6 email service economic/privacy boundary', () => {
  let sqlite: DatabaseSync
  let db: NodeDatabase
  let provider: FakeProvider
  let idCounter: number
  const clock = () => new Date(NOW)
  const randomId = () => `email-event-${++idCounter}`

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:')
    seed(sqlite)
    db = new NodeDatabase(sqlite)
    provider = new FakeProvider()
    idCounter = 0
  })

  afterEach(() => sqlite.close())

  it('requires an explicit server-side sending switch before creating events or contacting a provider', async () => {
    const env = { ...baseEnv(db), EMAIL_SENDING_ENABLED: 'false' }
    const result = await sendApplicationEmail(env, {
      userId: USER_A,
      templateKey: 'billing',
      idempotencyKey: 'disabled-send-event-001',
    }, { provider, clock, randomId })
    expect(result).toEqual({ status: 'not_configured', replayed: false, code: 'email_sending_disabled' })
    expect(provider.send).not.toHaveBeenCalled()
    expect(eventCount(sqlite, 'disabled-send-event-001')).toBe(0)
  })

  it('derives recipient from server-owned user data and replays a successful event without a second send', async () => {
    const first = await sendApplicationEmail(baseEnv(db), {
      userId: USER_A,
      templateKey: 'billing',
      templateInput: { planName: 'Pro', billingStatus: 'active' },
      idempotencyKey: 'billing-user-a-cycle-001',
    }, { provider, clock, randomId })
    const second = await sendApplicationEmail(baseEnv(db), {
      userId: USER_A,
      templateKey: 'billing',
      templateInput: { planName: 'Pro', billingStatus: 'active' },
      idempotencyKey: 'billing-user-a-cycle-001',
    }, { provider, clock, randomId })

    expect(first).toMatchObject({ status: 'sent', replayed: false, providerMessageId: 'provider-billing-user-a-cycle-001' })
    expect(second).toMatchObject({ status: 'sent', replayed: true, providerMessageId: 'provider-billing-user-a-cycle-001' })
    expect(provider.send).toHaveBeenCalledTimes(1)
    expect(provider.send.mock.calls[0][0].to).toBe('owner-a@example.com')
    expect(provider.send.mock.calls[0][1]).toEqual({ idempotencyKey: 'shippingapp/billing-user-a-cycle-001' })
    expect(eventCount(sqlite, 'billing-user-a-cycle-001')).toBe(1)
  })

  it('honors optional preferences while transactional mail remains independent', async () => {
    const digest = await sendApplicationEmail(baseEnv(db), {
      userId: USER_A,
      templateKey: 'weekly_digest',
      idempotencyKey: 'digest-user-a-week-001',
    }, { provider, clock, randomId })
    expect(digest).toMatchObject({ status: 'sent' })
    expect(provider.send).toHaveBeenCalledTimes(1)

    sqlite.prepare("UPDATE email_preferences SET digest_enabled = 0, alerts_enabled = 0, marketing_enabled = 0 WHERE user_id = ?").run(USER_A)
    const alert = await sendApplicationEmail(baseEnv(db), {
      userId: USER_A,
      templateKey: 'alert',
      templateInput: { productTitle: 'Paleta' },
      idempotencyKey: 'alert-user-a-001',
    }, { provider, clock, randomId })
    expect(alert).toMatchObject({ status: 'suppressed' })
    expect(provider.send).toHaveBeenCalledTimes(1)

    const billing = await sendApplicationEmail(baseEnv(db), {
      userId: USER_A,
      templateKey: 'billing',
      idempotencyKey: 'billing-user-a-002',
    }, { provider, clock, randomId })
    expect(billing).toMatchObject({ status: 'sent' })
    expect(provider.send).toHaveBeenCalledTimes(2)
  })

  it('requires unsubscribe infrastructure for optional mail but not for transactional mail', async () => {
    const env = { DB: db, EMAIL_SENDING_ENABLED: 'true', EMAIL_FROM: 'ShippingAPP <onboarding@resend.dev>' }
    const digest = await sendApplicationEmail(env, {
      userId: USER_A,
      templateKey: 'weekly_digest',
      idempotencyKey: 'digest-no-unsubscribe',
    }, { provider, clock, randomId })
    expect(digest).toEqual({ status: 'not_configured', replayed: false, code: 'unsubscribe_not_configured' })
    expect(provider.send).not.toHaveBeenCalled()

    const billing = await sendApplicationEmail(env, {
      userId: USER_A,
      templateKey: 'billing',
      idempotencyKey: 'billing-no-unsubscribe',
    }, { provider, clock, randomId })
    expect(billing.status).toBe('sent')
    expect(provider.send).toHaveBeenCalledTimes(1)
  })

  it('never accepts a caller-controlled origin as the unsubscribe-link host', async () => {
    const env = { ...baseEnv(db) } as Record<string, unknown> & { DB: D1DatabaseLike }
    delete env.EMAIL_PUBLIC_BASE_URL
    const result = await sendApplicationEmail(env, {
      userId: USER_A,
      templateKey: 'weekly_digest',
      idempotencyKey: 'caller-origin-phishing-001',
      origin: 'https://attacker.example',
    } as any, { provider, clock, randomId })
    expect(result).toEqual({ status: 'not_configured', replayed: false, code: 'unsubscribe_not_configured' })
    expect(provider.send).not.toHaveBeenCalled()
    expect(eventCount(sqlite, 'caller-origin-phishing-001')).toBe(0)
  })

  it('does not let another user reuse an idempotency key to redirect or duplicate an email', async () => {
    await sendApplicationEmail(baseEnv(db), {
      userId: USER_A,
      templateKey: 'billing',
      idempotencyKey: 'shared-idempotency-key-001',
    }, { provider, clock, randomId })
    const attack = await sendApplicationEmail(baseEnv(db), {
      userId: USER_B,
      templateKey: 'billing',
      idempotencyKey: 'shared-idempotency-key-001',
    }, { provider, clock, randomId })
    expect(attack).toMatchObject({ status: 'failed', replayed: true, code: 'email_idempotency_collision' })
    expect(provider.send).toHaveBeenCalledTimes(1)
    expect(provider.send.mock.calls[0][0].to).toBe('owner-a@example.com')
  })

  it('allows only one provider call across concurrent retries for the same logical event', async () => {
    let release!: () => void
    const waiting = new Promise<void>((resolve) => { release = resolve })
    provider.send.mockImplementationOnce(async () => {
      await waiting
      return { messageId: 'provider-concurrent-1' }
    })
    const first = sendApplicationEmail(baseEnv(db), {
      userId: USER_A,
      templateKey: 'billing',
      idempotencyKey: 'concurrent-email-event-001',
    }, { provider, clock, randomId })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const second = await sendApplicationEmail(baseEnv(db), {
      userId: USER_A,
      templateKey: 'billing',
      idempotencyKey: 'concurrent-email-event-001',
    }, { provider, clock, randomId })
    expect(second).toMatchObject({ status: 'queued', replayed: true })
    release()
    expect((await first).status).toBe('sent')
    expect(provider.send).toHaveBeenCalledTimes(1)
    expect(eventCount(sqlite, 'concurrent-email-event-001')).toBe(1)
  })

  it('sanitizes unexpected provider failures before persistence or caller response', async () => {
    const sensitive = 'resend-secret-stack-and-pii-owner-a@example.com'
    provider.send.mockRejectedValueOnce(new Error(sensitive))
    const result = await sendApplicationEmail(baseEnv(db), {
      userId: USER_A,
      templateKey: 'billing',
      idempotencyKey: 'provider-failure-event-001',
    }, { provider, clock, randomId })
    expect(result).toMatchObject({ status: 'failed', code: 'email_provider_unavailable' })
    expect(JSON.stringify(result)).not.toContain(sensitive)
    const row = sqlite.prepare('SELECT metadata_json FROM email_events WHERE idempotency_key = ?').get('provider-failure-event-001') as any
    expect(String(row.metadata_json)).not.toContain(sensitive)
    expect(String(row.metadata_json)).toContain('email_provider_unavailable')
  })

  it('fails closed when server-owned recipient email is unavailable instead of accepting a client address', async () => {
    sqlite.prepare('UPDATE users SET email = NULL WHERE id = ?').run(USER_A)
    const result = await sendApplicationEmail(baseEnv(db), {
      userId: USER_A,
      templateKey: 'billing',
      templateInput: { displayName: 'attacker@example.com' },
      idempotencyKey: 'missing-server-recipient-001',
    }, { provider, clock, randomId })
    expect(result).toEqual({ status: 'not_configured', replayed: false, code: 'recipient_email_unavailable' })
    expect(provider.send).not.toHaveBeenCalled()
  })
})