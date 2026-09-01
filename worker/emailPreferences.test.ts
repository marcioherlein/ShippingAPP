import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { handleApplicationEmail } from './emailPreferences'
import type { D1DatabaseLike, D1PreparedStatementLike, D1RunResultLike, D1Value } from './persistence/d1'
import { createUnsubscribeToken } from './unsubscribeToken'

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

const USER_A = 'user-a-email-stage6'
const USER_B = 'user-b-email-stage6'
const NOW = '2026-09-01T12:00:00.000Z'
const SECRET = 'stage-6-unsubscribe-secret-0000000000000000000000000000'

function seed(sqlite: DatabaseSync) {
  for (const migration of ['0001_saas_foundation.sql', '0002_analysis_history.sql', '0003_usage_entitlements.sql']) {
    sqlite.exec(readFileSync(`migrations/${migration}`, 'utf8'))
  }
  const insert = sqlite.prepare("INSERT INTO users (id, auth_provider, auth_subject, email, display_name, created_at, updated_at) VALUES (?, 'clerk', ?, ?, ?, ?, ?)")
  insert.run(USER_A, 'clerk-a', 'a@example.com', 'Usuario A', NOW, NOW)
  insert.run(USER_B, 'clerk-b', 'b@example.com', 'Usuario B', NOW, NOW)
}

function trusted(path: string, userId: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('x-shippingapp-auth-kind', 'user')
  headers.set('x-shippingapp-user-id', userId)
  return new Request(`https://shippingapp.test${path}`, { ...init, headers })
}

function service(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('x-shippingapp-auth-kind', 'service')
  return new Request(`https://shippingapp.test${path}`, { ...init, headers })
}

function scalar(sqlite: DatabaseSync, sql: string, ...values: any[]) {
  return Number((sqlite.prepare(sql).get(...values) as any).value)
}

describe('Stage 6 email preference and unsubscribe boundary', () => {
  let sqlite: DatabaseSync
  let db: NodeDatabase

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:')
    seed(sqlite)
    db = new NodeDatabase(sqlite)
  })

  afterEach(() => sqlite.close())

  it('creates privacy-safe defaults for the authenticated owner only', async () => {
    const response = await handleApplicationEmail(trusted('/api/email-preferences', USER_A), { DB: db })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      preferences: {
        digestEnabled: true,
        alertsEnabled: true,
        marketingEnabled: false,
        timezone: 'UTC',
        transactional: { configurable: false },
      },
    })
    expect(scalar(sqlite, 'SELECT COUNT(*) AS value FROM email_preferences WHERE user_id = ?', USER_A)).toBe(1)
    expect(scalar(sqlite, 'SELECT COUNT(*) AS value FROM email_preferences WHERE user_id = ?', USER_B)).toBe(0)
  })

  it('ignores forged owner fields and cannot mutate another user preference row', async () => {
    await handleApplicationEmail(trusted('/api/email-preferences', USER_B), { DB: db })
    const response = await handleApplicationEmail(trusted('/api/email-preferences', USER_A, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: USER_B, marketingEnabled: true, digestEnabled: false }),
    }), { DB: db })
    expect(response.status).toBe(200)
    expect(scalar(sqlite, 'SELECT marketing_enabled AS value FROM email_preferences WHERE user_id = ?', USER_A)).toBe(1)
    expect(scalar(sqlite, 'SELECT digest_enabled AS value FROM email_preferences WHERE user_id = ?', USER_A)).toBe(0)
    expect(scalar(sqlite, 'SELECT marketing_enabled AS value FROM email_preferences WHERE user_id = ?', USER_B)).toBe(0)
    expect(scalar(sqlite, 'SELECT digest_enabled AS value FROM email_preferences WHERE user_id = ?', USER_B)).toBe(1)
  })

  it('rejects operational service identity and invalid timezone mutations', async () => {
    expect((await handleApplicationEmail(service('/api/email-preferences'), { DB: db })).status).toBe(401)
    const invalid = await handleApplicationEmail(trusted('/api/email-preferences', USER_A, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timezone: 'Mars/Olympus_Mons' }),
    }), { DB: db })
    expect(invalid.status).toBe(400)
    expect(scalar(sqlite, 'SELECT COUNT(*) AS value FROM email_preferences WHERE user_id = ?', USER_A)).toBe(0)
  })

  it('GET unsubscribe confirms but does not mutate; POST disables only signed user and scope', async () => {
    await handleApplicationEmail(trusted('/api/email-preferences', USER_A), { DB: db })
    await handleApplicationEmail(trusted('/api/email-preferences', USER_B), { DB: db })
    const token = await createUnsubscribeToken({
      userId: USER_A,
      scope: 'digest',
      secret: SECRET,
      expiresAt: new Date('2027-09-01T00:00:00Z'),
    })
    const env = { DB: db, EMAIL_UNSUBSCRIBE_SECRET: SECRET }
    const confirmation = await handleApplicationEmail(new Request(`https://shippingapp.test/api/email-unsubscribe?token=${encodeURIComponent(token)}`), env, {
      clock: () => new Date(NOW),
    })
    expect(confirmation.status).toBe(200)
    expect(confirmation.headers.get('content-security-policy')).toContain("form-action 'self'")
    expect(scalar(sqlite, 'SELECT digest_enabled AS value FROM email_preferences WHERE user_id = ?', USER_A)).toBe(1)

    const post = await handleApplicationEmail(new Request('https://shippingapp.test/api/email-unsubscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ token }),
    }), env, { clock: () => new Date(NOW) })
    expect(post.status).toBe(200)
    await expect(post.json()).resolves.toEqual({ unsubscribed: true, scope: 'digest' })
    expect(scalar(sqlite, 'SELECT digest_enabled AS value FROM email_preferences WHERE user_id = ?', USER_A)).toBe(0)
    expect(scalar(sqlite, 'SELECT digest_enabled AS value FROM email_preferences WHERE user_id = ?', USER_B)).toBe(1)
  })

  it('rejects forged unsubscribe token without changing any user', async () => {
    await handleApplicationEmail(trusted('/api/email-preferences', USER_A), { DB: db })
    const token = await createUnsubscribeToken({
      userId: USER_A,
      scope: 'alerts',
      secret: SECRET,
      expiresAt: new Date('2027-09-01T00:00:00Z'),
    })
    const forged = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`
    const response = await handleApplicationEmail(new Request('https://shippingapp.test/api/email-unsubscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ token: forged }),
    }), { DB: db, EMAIL_UNSUBSCRIBE_SECRET: SECRET }, { clock: () => new Date(NOW) })
    expect(response.status).toBe(400)
    expect(scalar(sqlite, 'SELECT alerts_enabled AS value FROM email_preferences WHERE user_id = ?', USER_A)).toBe(1)
  })

  it('keeps runtime diagnostics secret-free', async () => {
    const response = await handleApplicationEmail(new Request('https://shippingapp.test/api/email-runtime'), {
      DB: db,
      RESEND_API_KEY: 're_secret_never_return_me',
      EMAIL_UNSUBSCRIBE_SECRET: SECRET,
      EMAIL_PUBLIC_BASE_URL: 'https://shippingapp.test',
      EMAIL_FROM: 'ShippingAPP <onboarding@resend.dev>',
    })
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).not.toContain('re_secret_never_return_me')
    expect(text).not.toContain(SECRET)
    expect(text).not.toContain('a@example.com')
    expect(JSON.parse(text)).toMatchObject({
      status: 'ok',
      email: { provider: 'resend', providerConfigured: true, senderConfigured: true, unsubscribeConfigured: true },
    })
  })
})
