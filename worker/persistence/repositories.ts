import type { D1DatabaseLike, D1Value } from './d1'

type Clock = () => Date

type UserRow = {
  id: string
  auth_provider: string
  auth_subject: string
  email: string | null
  display_name: string | null
  created_at: string
  updated_at: string
}

type UsagePeriodRow = {
  id: string
  user_id: string
  plan_id: string
  period_start: string
  period_end: string
  credits_granted: number
  credits_consumed: number
  created_at: string
  updated_at: string
}

type BillingEventRow = {
  id: string
  provider: string
  provider_event_id: string
  event_type: string
  user_id: string | null
  subscription_id: string | null
  payload_sha256: string
  status: string
  error_code: string | null
  created_at: string
  processed_at: string | null
}

type AnalysisRow = {
  id: string
  user_id: string
  request_id: string | null
  idempotency_key: string | null
  status: string
  input_json: string
  result_json: string | null
  error_code: string | null
  created_at: string
  updated_at: string
}

const MAX = {
  id: 64,
  authProvider: 40,
  authSubject: 191,
  email: 320,
  displayName: 120,
  planCode: 40,
  planName: 80,
  provider: 40,
  providerId: 191,
  idempotencyKey: 191,
  reason: 240,
  title: 240,
  sourceUrl: 2048,
  timezone: 64,
  eventType: 120,
  inputJson: 262144,
  resultJson: 1048576,
  metadataJson: 262144,
  snapshotJson: 524288,
} as const

function required(label: string, value: string, max: number) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new Error(`${label} must be between 1 and ${max} characters.`)
  }
  return value
}

function optional(label: string, value: string | null | undefined, max: number) {
  if (value == null) return null
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label} exceeds ${max} characters.`)
  return value
}

function integer(label: string, value: number, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) throw new Error(`${label} must be an integer >= ${min}.`)
  return value
}

function finiteNonNegative(label: string, value: number | null | undefined) {
  if (value == null) return null
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number.`)
  return value
}

function isoUtc(label: string, value: string) {
  if (typeof value !== 'string' || !value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid UTC ISO timestamp.`)
  }
  return new Date(value).toISOString()
}

function jsonText(label: string, value: unknown, max: number) {
  const text = JSON.stringify(value)
  if (typeof text !== 'string') throw new Error(`${label} is not JSON serializable.`)
  if (text.length > max) throw new Error(`${label} exceeds ${max} characters.`)
  return text
}

function nullableJsonText(label: string, value: unknown | null | undefined, max: number) {
  return value == null ? null : jsonText(label, value, max)
}

function boolInt(value: boolean) {
  return value ? 1 : 0
}

async function first<T>(db: D1DatabaseLike, sql: string, values: D1Value[]) {
  return db.prepare(sql).bind(...values).first<T>()
}

async function run(db: D1DatabaseLike, sql: string, values: D1Value[]) {
  return db.prepare(sql).bind(...values).run()
}

export class SaasRepository {
  constructor(private readonly db: D1DatabaseLike, private readonly clock: Clock = () => new Date()) {}

  private now() {
    return this.clock().toISOString()
  }

  async createUser(input: { id: string; authProvider: string; authSubject: string; email?: string | null; displayName?: string | null }) {
    const now = this.now()
    await run(this.db,
      `INSERT INTO users (id, auth_provider, auth_subject, email, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [required('id', input.id, MAX.id), required('authProvider', input.authProvider, MAX.authProvider), required('authSubject', input.authSubject, MAX.authSubject), optional('email', input.email, MAX.email), optional('displayName', input.displayName, MAX.displayName), now, now],
    )
    return this.getUserById(input.id)
  }

  getUserById(id: string) {
    return first<UserRow>(this.db, 'SELECT * FROM users WHERE id = ?', [required('id', id, MAX.id)])
  }

  async createPlan(input: { id: string; code: string; name: string; monthlyCredits: number; monitoringEnabled?: boolean; active?: boolean }) {
    const now = this.now()
    await run(this.db,
      `INSERT INTO plans (id, code, name, monthly_credits, monitoring_enabled, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [required('id', input.id, MAX.id), required('code', input.code, MAX.planCode), required('name', input.name, MAX.planName), integer('monthlyCredits', input.monthlyCredits), boolInt(input.monitoringEnabled ?? false), boolInt(input.active ?? true), now, now],
    )
  }

  async createSubscription(input: { id: string; userId: string; planId: string; provider: string; providerCustomerId?: string | null; providerSubscriptionId?: string | null; status: 'pending' | 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled' | 'expired'; currentPeriodStart?: string | null; currentPeriodEnd?: string | null; cancelAtPeriodEnd?: boolean }) {
    const now = this.now()
    await run(this.db,
      `INSERT INTO subscriptions (id, user_id, plan_id, provider, provider_customer_id, provider_subscription_id, status, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [required('id', input.id, MAX.id), required('userId', input.userId, MAX.id), required('planId', input.planId, MAX.id), required('provider', input.provider, MAX.provider), optional('providerCustomerId', input.providerCustomerId, MAX.providerId), optional('providerSubscriptionId', input.providerSubscriptionId, MAX.providerId), input.status, input.currentPeriodStart ? isoUtc('currentPeriodStart', input.currentPeriodStart) : null, input.currentPeriodEnd ? isoUtc('currentPeriodEnd', input.currentPeriodEnd) : null, boolInt(input.cancelAtPeriodEnd ?? false), now, now],
    )
  }

  async initializeUsagePeriod(input: { id: string; userId: string; planId: string; periodStart: string; periodEnd: string; creditsGranted: number }) {
    const now = this.now()
    const values: D1Value[] = [required('id', input.id, MAX.id), required('userId', input.userId, MAX.id), required('planId', input.planId, MAX.id), isoUtc('periodStart', input.periodStart), isoUtc('periodEnd', input.periodEnd), integer('creditsGranted', input.creditsGranted), now, now]
    await run(this.db,
      `INSERT INTO usage_periods (id, user_id, plan_id, period_start, period_end, credits_granted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, period_start, period_end) DO NOTHING`, values)
    const existing = await first<UsagePeriodRow>(this.db,
      'SELECT * FROM usage_periods WHERE user_id = ? AND period_start = ? AND period_end = ?',
      [values[1], values[3], values[4]],
    )
    if (!existing) throw new Error('Usage period initialization failed.')
    if (existing.plan_id !== input.planId || existing.credits_granted !== input.creditsGranted) {
      throw new Error('Usage period idempotency collision.')
    }
    return existing
  }

  async createAnalysis(input: { id: string; userId: string; requestId?: string | null; idempotencyKey?: string | null; status?: 'pending' | 'completed' | 'failed'; input: unknown; result?: unknown | null; errorCode?: string | null }) {
    const now = this.now()
    const userId = required('userId', input.userId, MAX.id)
    const idempotencyKey = optional('idempotencyKey', input.idempotencyKey, MAX.idempotencyKey)
    const inputJson = jsonText('analysis input', input.input, MAX.inputJson)
    const resultJson = nullableJsonText('analysis result', input.result, MAX.resultJson)
    await run(this.db,
      `INSERT INTO analyses (id, user_id, request_id, idempotency_key, status, input_json, result_json, error_code, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, idempotency_key) DO NOTHING`,
      [required('id', input.id, MAX.id), userId, optional('requestId', input.requestId, MAX.id), idempotencyKey, input.status ?? 'pending', inputJson, resultJson, optional('errorCode', input.errorCode, 80), now, now],
    )
    const row = idempotencyKey
      ? await first<AnalysisRow>(this.db, 'SELECT * FROM analyses WHERE user_id = ? AND idempotency_key = ?', [userId, idempotencyKey])
      : await first<AnalysisRow>(this.db, 'SELECT * FROM analyses WHERE id = ?', [input.id])
    if (!row) throw new Error('Analysis creation failed.')
    if (idempotencyKey && row.input_json !== inputJson) throw new Error('Analysis idempotency collision.')
    return row
  }

  async addCreditLedgerEntry(input: { id: string; userId: string; usagePeriodId: string; analysisId?: string | null; entryType: 'grant' | 'consume' | 'refund' | 'adjustment'; deltaCredits: number; idempotencyKey: string; reason?: string | null }) {
    if (!Number.isSafeInteger(input.deltaCredits) || input.deltaCredits === 0) throw new Error('deltaCredits must be a non-zero integer.')
    const now = this.now()
    const key = required('idempotencyKey', input.idempotencyKey, MAX.idempotencyKey)
    await run(this.db,
      `INSERT INTO credit_ledger (id, user_id, usage_period_id, analysis_id, entry_type, delta_credits, idempotency_key, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(idempotency_key) DO NOTHING`,
      [required('id', input.id, MAX.id), required('userId', input.userId, MAX.id), required('usagePeriodId', input.usagePeriodId, MAX.id), optional('analysisId', input.analysisId, MAX.id), input.entryType, input.deltaCredits, key, optional('reason', input.reason, MAX.reason), now],
    )
    const row = await first<any>(this.db, 'SELECT * FROM credit_ledger WHERE idempotency_key = ?', [key])
    if (!row) throw new Error('Credit ledger write failed.')
    if (row.user_id !== input.userId || row.usage_period_id !== input.usagePeriodId || row.analysis_id !== (input.analysisId ?? null) || row.entry_type !== input.entryType || row.delta_credits !== input.deltaCredits) {
      throw new Error('Credit ledger idempotency collision.')
    }
    return row
  }

  async createWatchlistItem(input: { id: string; userId: string; analysisId?: string | null; title: string; sourceUrl: string; metadata?: unknown | null }) {
    const now = this.now()
    await run(this.db,
      `INSERT INTO watchlist_items (id, user_id, analysis_id, title, source_url, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [required('id', input.id, MAX.id), required('userId', input.userId, MAX.id), optional('analysisId', input.analysisId, MAX.id), required('title', input.title, MAX.title), required('sourceUrl', input.sourceUrl, MAX.sourceUrl), nullableJsonText('watchlist metadata', input.metadata, MAX.metadataJson), now, now],
    )
  }

  async deleteWatchlistItem(userId: string, itemId: string) {
    const result = await run(this.db, 'DELETE FROM watchlist_items WHERE id = ? AND user_id = ?', [required('itemId', itemId, MAX.id), required('userId', userId, MAX.id)])
    return result.meta?.changes ?? 0
  }

  async addWatchlistSnapshot(input: { id: string; watchlistItemId: string; observedAt: string; marketPriceArs?: number | null; landedCostArs?: number | null; payload?: unknown | null; idempotencyKey: string }) {
    const now = this.now()
    await run(this.db,
      `INSERT INTO watchlist_snapshots (id, watchlist_item_id, observed_at, market_price_ars, landed_cost_ars, payload_json, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [required('id', input.id, MAX.id), required('watchlistItemId', input.watchlistItemId, MAX.id), isoUtc('observedAt', input.observedAt), finiteNonNegative('marketPriceArs', input.marketPriceArs), finiteNonNegative('landedCostArs', input.landedCostArs), nullableJsonText('snapshot payload', input.payload, MAX.snapshotJson), required('idempotencyKey', input.idempotencyKey, MAX.idempotencyKey), now],
    )
  }

  async upsertEmailPreferences(input: { userId: string; digestEnabled: boolean; alertsEnabled: boolean; marketingEnabled: boolean; timezone: string }) {
    const now = this.now()
    await run(this.db,
      `INSERT INTO email_preferences (user_id, digest_enabled, alerts_enabled, marketing_enabled, timezone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET digest_enabled = excluded.digest_enabled, alerts_enabled = excluded.alerts_enabled, marketing_enabled = excluded.marketing_enabled, timezone = excluded.timezone, updated_at = excluded.updated_at`,
      [required('userId', input.userId, MAX.id), boolInt(input.digestEnabled), boolInt(input.alertsEnabled), boolInt(input.marketingEnabled), required('timezone', input.timezone, MAX.timezone), now, now],
    )
    return first<any>(this.db, 'SELECT * FROM email_preferences WHERE user_id = ?', [input.userId])
  }

  async recordEmailEvent(input: { id: string; userId?: string | null; eventType: string; recipient: string; provider?: string | null; providerMessageId?: string | null; idempotencyKey: string; status: 'queued' | 'sent' | 'delivered' | 'failed' | 'suppressed'; metadata?: unknown | null; sentAt?: string | null }) {
    const now = this.now()
    const key = required('idempotencyKey', input.idempotencyKey, MAX.idempotencyKey)
    await run(this.db,
      `INSERT INTO email_events (id, user_id, event_type, recipient, provider, provider_message_id, idempotency_key, status, metadata_json, created_at, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(idempotency_key) DO NOTHING`,
      [required('id', input.id, MAX.id), optional('userId', input.userId, MAX.id), required('eventType', input.eventType, 80), required('recipient', input.recipient, MAX.email), optional('provider', input.provider, MAX.provider), optional('providerMessageId', input.providerMessageId, MAX.providerId), key, input.status, nullableJsonText('email metadata', input.metadata, MAX.metadataJson), now, input.sentAt ? isoUtc('sentAt', input.sentAt) : null],
    )
    const row = await first<any>(this.db, 'SELECT * FROM email_events WHERE idempotency_key = ?', [key])
    if (!row) throw new Error('Email event write failed.')
    if (row.event_type !== input.eventType || row.recipient !== input.recipient) throw new Error('Email event idempotency collision.')
    return row
  }

  async recordBillingEvent(input: { id: string; provider: string; providerEventId: string; eventType: string; userId?: string | null; subscriptionId?: string | null; payloadSha256: string; status?: 'received' | 'processed' | 'ignored' | 'failed' }) {
    const now = this.now()
    const provider = required('provider', input.provider, MAX.provider)
    const providerEventId = required('providerEventId', input.providerEventId, MAX.providerId)
    if (!/^[0-9a-f]{64}$/.test(input.payloadSha256)) throw new Error('payloadSha256 must be a lowercase SHA-256 hex digest.')
    await run(this.db,
      `INSERT INTO billing_events (id, provider, provider_event_id, event_type, user_id, subscription_id, payload_sha256, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider, provider_event_id) DO NOTHING`,
      [required('id', input.id, MAX.id), provider, providerEventId, required('eventType', input.eventType, MAX.eventType), optional('userId', input.userId, MAX.id), optional('subscriptionId', input.subscriptionId, MAX.id), input.payloadSha256, input.status ?? 'received', now],
    )
    const row = await first<BillingEventRow>(this.db, 'SELECT * FROM billing_events WHERE provider = ? AND provider_event_id = ?', [provider, providerEventId])
    if (!row) throw new Error('Billing event write failed.')
    if (row.payload_sha256 !== input.payloadSha256 || row.event_type !== input.eventType) throw new Error('Billing provider-event replay mismatch.')
    return row
  }
}
