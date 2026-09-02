import type { D1DatabaseLike, D1Value } from './d1'

const MAX = {
  id: 64,
  operationKey: 120,
  routeId: 80,
  responseBody: 1048576,
  responseContentType: 120,
  errorCode: 80,
} as const

const DEFAULT_LEASE_MS = 15 * 60 * 1000
export const MAX_NCM_CONTINUATION_ATTEMPTS = 3

export type EntitlementPlanRow = {
  id: string
  code: string
  name: string
  monthly_credits: number
  monitoring_enabled: number
  subscription_id: string | null
  current_period_start: string | null
  current_period_end: string | null
}

export type UsagePeriodRow = {
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

export type CreditReservationStatus = 'running' | 'continuation_ready' | 'continuation_running' | 'settled' | 'released'
export type CreditReservationRow = {
  id: string
  user_id: string
  usage_period_id: string
  operation_key: string
  route_id: string
  operation_kind: 'standalone' | 'full_analysis'
  credits: number
  attempt_no: number
  continuation_attempt_no: number
  status: CreditReservationStatus
  lease_expires_at: string
  initial_response_status: number | null
  initial_response_content_type: string | null
  initial_response_body: string | null
  continuation_response_status: number | null
  continuation_response_content_type: string | null
  continuation_response_body: string | null
  last_error_code: string | null
  created_at: string
  updated_at: string
  settled_at: string | null
  released_at: string | null
}

export type UsageView = {
  plan: {
    code: string
    name: string
    monthlyCredits: number
    monitoringEnabled: boolean
  }
  period: {
    id: string
    start: string
    end: string
    creditsGranted: number
    creditsConsumed: number
    creditsRemaining: number
  }
}

export type StoredResponse = {
  status: number
  contentType: string
  body: string
}

function required(label: string, value: string, max: number, min = 1) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new Error(`${label} must be between ${min} and ${max} characters.`)
  }
  return value
}

function utcMonthWindow(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0))
  return { start: start.toISOString(), end: end.toISOString() }
}

function validSubscriptionWindow(plan: EntitlementPlanRow, nowIso: string) {
  const start = plan.current_period_start
  const end = plan.current_period_end
  if (!start || !end) return null
  if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) || end <= start) return null
  if (start > nowIso || end <= nowIso) return null
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() }
}

function storedResponse(status: number | null, contentType: string | null, body: string | null): StoredResponse | null {
  if (status == null || body == null) return null
  return { status, contentType: contentType || 'application/json; charset=utf-8', body }
}

async function first<T>(db: D1DatabaseLike, sql: string, values: D1Value[]) {
  return db.prepare(sql).bind(...values).first<T>()
}

async function run(db: D1DatabaseLike, sql: string, values: D1Value[]) {
  return db.prepare(sql).bind(...values).run()
}

function dbErrorCode(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  if (text.includes('attempt_limit_exhausted')) return 'attempt_limit_exhausted'
  if (text.includes('reservation_period_expired')) return 'period_expired'
  if (text.includes('quota_exhausted')) return 'quota_exhausted'
  if (text.includes('UNIQUE constraint failed: credit_reservations.user_id, credit_reservations.operation_key')) return 'operation_exists'
  if (text.includes('reservation_')) return 'reservation_invariant'
  return 'database_error'
}

export class UsageRepository {
  constructor(
    private readonly db: D1DatabaseLike,
    private readonly clock: () => Date = () => new Date(),
    private readonly randomId: () => string = () => crypto.randomUUID(),
  ) {}

  private now() { return this.clock().toISOString() }
  private lease() { return new Date(this.clock().getTime() + DEFAULT_LEASE_MS).toISOString() }

  async resolvePlanForUser(userId: string) {
    const owner = required('userId', userId, MAX.id)
    const now = this.now()
    const paid = await first<EntitlementPlanRow>(this.db,
      `SELECT p.id, p.code, p.name, p.monthly_credits, p.monitoring_enabled,
              s.id AS subscription_id, s.current_period_start, s.current_period_end
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.user_id = ?
         AND s.status IN ('active', 'trialing')
         AND p.active = 1
         AND (s.current_period_start IS NULL OR s.current_period_start <= ?)
         AND (s.current_period_end IS NULL OR s.current_period_end > ?)
       ORDER BY p.monthly_credits DESC, s.updated_at DESC, s.id DESC
       LIMIT 1`,
      [owner, now, now],
    )
    if (paid) return paid

    const free = await first<EntitlementPlanRow>(this.db,
      `SELECT id, code, name, monthly_credits, monitoring_enabled,
              NULL AS subscription_id, NULL AS current_period_start, NULL AS current_period_end
       FROM plans WHERE code = 'free' AND active = 1 LIMIT 1`,
      [],
    )
    if (!free) throw new Error('free_plan_not_configured')
    return free
  }

  async ensureCurrentUsagePeriod(userId: string) {
    const owner = required('userId', userId, MAX.id)
    const nowDate = this.clock()
    const now = nowDate.toISOString()
    const plan = await this.resolvePlanForUser(owner)
    const subscriptionWindow = validSubscriptionWindow(plan, now)
    const window = subscriptionWindow ?? utcMonthWindow(nowDate)
    const id = this.randomId()

    await run(this.db,
      `INSERT INTO usage_periods (
        id, user_id, plan_id, period_start, period_end,
        credits_granted, credits_consumed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(user_id, period_start, period_end) DO NOTHING`,
      [id, owner, plan.id, window.start, window.end, plan.monthly_credits, now, now],
    )

    let period = await first<UsagePeriodRow>(this.db,
      `SELECT * FROM usage_periods
       WHERE user_id = ? AND period_start = ? AND period_end = ?`,
      [owner, window.start, window.end],
    )
    if (!period) throw new Error('usage_period_initialization_failed')

    if (period.plan_id !== plan.id && plan.monthly_credits > period.credits_granted) {
      await run(this.db,
        `UPDATE usage_periods
         SET plan_id = ?, credits_granted = ?, updated_at = ?
         WHERE id = ? AND user_id = ? AND credits_granted < ?`,
        [plan.id, plan.monthly_credits, now, period.id, owner, plan.monthly_credits],
      )
      period = await first<UsagePeriodRow>(this.db,
        `SELECT * FROM usage_periods WHERE id = ? AND user_id = ?`,
        [period.id, owner],
      )
      if (!period) throw new Error('usage_period_upgrade_failed')
    }

    return { plan, period }
  }

  async releaseStaleForUser(userId: string) {
    const owner = required('userId', userId, MAX.id)
    const now = this.now()
    const result = await run(this.db,
      `UPDATE credit_reservations
       SET status = 'released', last_error_code = 'lease_expired', released_at = ?, updated_at = ?
       WHERE user_id = ?
         AND status IN ('running', 'continuation_running')
         AND lease_expires_at <= ?`,
      [now, now, owner, now],
    )
    return result.meta?.changes ?? 0
  }

  async usageView(userId: string): Promise<UsageView> {
    const owner = required('userId', userId, MAX.id)
    await this.releaseStaleForUser(owner)
    const { plan, period } = await this.ensureCurrentUsagePeriod(owner)
    return {
      plan: {
        code: plan.code,
        name: plan.name,
        monthlyCredits: plan.monthly_credits,
        monitoringEnabled: plan.monitoring_enabled === 1,
      },
      period: {
        id: period.id,
        start: period.period_start,
        end: period.period_end,
        creditsGranted: period.credits_granted,
        creditsConsumed: period.credits_consumed,
        creditsRemaining: Math.max(0, period.credits_granted - period.credits_consumed),
      },
    }
  }

  getReservationForUser(userId: string, reservationId: string) {
    return first<CreditReservationRow>(this.db,
      `SELECT * FROM credit_reservations WHERE id = ? AND user_id = ?`,
      [required('reservationId', reservationId, MAX.id), required('userId', userId, MAX.id)],
    )
  }

  getOperationForUser(userId: string, operationKey: string) {
    return first<CreditReservationRow>(this.db,
      `SELECT * FROM credit_reservations WHERE user_id = ? AND operation_key = ?`,
      [required('userId', userId, MAX.id), required('operationKey', operationKey, MAX.operationKey, 8)],
    )
  }

  async begin(input: {
    userId: string
    operationKey: string
    routeId: string
    operationKind: 'standalone' | 'full_analysis'
    credits?: number
  }): Promise<
    | { kind: 'started'; reservation: CreditReservationRow; usage: UsageView }
    | { kind: 'existing'; reservation: CreditReservationRow; usage: UsageView }
    | { kind: 'quota_exhausted'; usage: UsageView }
    | { kind: 'attempt_limit_exhausted'; usage: UsageView }
    | { kind: 'period_expired'; usage: UsageView }
    | { kind: 'collision'; reservation: CreditReservationRow; usage: UsageView }
  > {
    const userId = required('userId', input.userId, MAX.id)
    const operationKey = required('operationKey', input.operationKey, MAX.operationKey, 8)
    const routeId = required('routeId', input.routeId, MAX.routeId)
    const credits = input.credits ?? 1
    if (!Number.isSafeInteger(credits) || credits < 1 || credits > 100) throw new Error('credits_invalid')

    await this.releaseStaleForUser(userId)
    const { period } = await this.ensureCurrentUsagePeriod(userId)
    const now = this.now()
    const id = this.randomId()

    try {
      await run(this.db,
        `INSERT INTO credit_reservations (
          id, user_id, usage_period_id, operation_key, route_id, operation_kind,
          credits, attempt_no, status, lease_expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'running', ?, ?, ?)`,
        [id, userId, period.id, operationKey, routeId, input.operationKind, credits, this.lease(), now, now],
      )
    } catch (error) {
      const code = dbErrorCode(error)
      if (code === 'quota_exhausted') return { kind: 'quota_exhausted', usage: await this.usageView(userId) }
      if (code === 'attempt_limit_exhausted') return { kind: 'attempt_limit_exhausted', usage: await this.usageView(userId) }
      if (code === 'period_expired') return { kind: 'period_expired', usage: await this.usageView(userId) }
      if (code !== 'operation_exists') throw error
    }

    let row = await this.getOperationForUser(userId, operationKey)
    if (!row) throw new Error('credit_reservation_initialization_failed')

    if (row.route_id !== routeId || row.operation_kind !== input.operationKind || row.credits !== credits) {
      return { kind: 'collision', reservation: row, usage: await this.usageView(userId) }
    }

    if (row.id === id) return { kind: 'started', reservation: row, usage: await this.usageView(userId) }

    if (row.status === 'released') {
      if (row.usage_period_id !== period.id) {
        return { kind: 'period_expired', usage: await this.usageView(userId) }
      }

      const retryNow = this.now()
      try {
        const result = await run(this.db,
          `UPDATE credit_reservations
           SET status = 'running', attempt_no = attempt_no + 1,
               continuation_attempt_no = 0,
               lease_expires_at = ?, initial_response_status = NULL,
               initial_response_content_type = NULL, initial_response_body = NULL,
               continuation_response_status = NULL, continuation_response_content_type = NULL,
               continuation_response_body = NULL, last_error_code = NULL,
               settled_at = NULL, released_at = NULL, updated_at = ?
           WHERE id = ? AND user_id = ? AND status = 'released' AND attempt_no = ?`,
          [this.lease(), retryNow, row.id, userId, row.attempt_no],
        )
        if ((result.meta?.changes ?? 0) === 1) {
          const retried = await this.getReservationForUser(userId, row.id)
          if (!retried) throw new Error('credit_reservation_retry_failed')
          return { kind: 'started', reservation: retried, usage: await this.usageView(userId) }
        }
      } catch (error) {
        const code = dbErrorCode(error)
        if (code === 'quota_exhausted') return { kind: 'quota_exhausted', usage: await this.usageView(userId) }
        if (code === 'attempt_limit_exhausted') return { kind: 'attempt_limit_exhausted', usage: await this.usageView(userId) }
        if (code === 'period_expired') return { kind: 'period_expired', usage: await this.usageView(userId) }
        throw error
      }
      row = await this.getOperationForUser(userId, operationKey)
      if (!row) throw new Error('credit_reservation_retry_race_missing')
    }

    return { kind: 'existing', reservation: row, usage: await this.usageView(userId) }
  }

  async markContinuationReady(userId: string, reservationId: string, response: StoredResponse) {
    const body = required('response.body', response.body, MAX.responseBody)
    const contentType = required('response.contentType', response.contentType || 'application/json; charset=utf-8', MAX.responseContentType)
    const now = this.now()
    const result = await run(this.db,
      `UPDATE credit_reservations
       SET status = 'continuation_ready', lease_expires_at = ?,
           initial_response_status = ?, initial_response_content_type = ?, initial_response_body = ?,
           updated_at = ?
       WHERE id = ? AND user_id = ? AND status = 'running'`,
      [this.lease(), response.status, contentType, body, now, required('reservationId', reservationId, MAX.id), required('userId', userId, MAX.id)],
    )
    return result.meta?.changes ?? 0
  }

  async settleStandalone(userId: string, reservationId: string, response: StoredResponse) {
    const body = required('response.body', response.body, MAX.responseBody)
    const contentType = required('response.contentType', response.contentType || 'application/json; charset=utf-8', MAX.responseContentType)
    const now = this.now()
    const result = await run(this.db,
      `UPDATE credit_reservations
       SET status = 'settled', initial_response_status = ?, initial_response_content_type = ?, initial_response_body = ?,
           settled_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND status = 'running'`,
      [response.status, contentType, body, now, now, required('reservationId', reservationId, MAX.id), required('userId', userId, MAX.id)],
    )
    return result.meta?.changes ?? 0
  }

  async claimContinuation(userId: string, reservationId: string) {
    const owner = required('userId', userId, MAX.id)
    const id = required('reservationId', reservationId, MAX.id)
    await this.releaseStaleForUser(owner)
    let row = await this.getReservationForUser(owner, id)
    if (!row) return { kind: 'not_found' as const }
    if (row.operation_kind !== 'full_analysis' || !['analyze', 'intake'].includes(row.route_id)) {
      return { kind: 'invalid' as const, reservation: row }
    }
    if (row.status === 'settled') return { kind: 'settled' as const, reservation: row }
    if (row.status !== 'continuation_ready') return { kind: row.status === 'released' ? 'released' as const : 'in_progress' as const, reservation: row }
    if (row.continuation_attempt_no >= MAX_NCM_CONTINUATION_ATTEMPTS) {
      return { kind: 'limit_reached' as const, reservation: row }
    }

    const now = this.now()
    const result = await run(this.db,
      `UPDATE credit_reservations
       SET status = 'continuation_running',
           continuation_attempt_no = continuation_attempt_no + 1,
           lease_expires_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND status = 'continuation_ready'
         AND continuation_attempt_no < ?`,
      [this.lease(), now, id, owner, MAX_NCM_CONTINUATION_ATTEMPTS],
    )
    if ((result.meta?.changes ?? 0) !== 1) {
      row = await this.getReservationForUser(owner, id)
      if (!row) return { kind: 'not_found' as const }
      if (row.status === 'settled') return { kind: 'settled' as const, reservation: row }
      if (row.status === 'continuation_ready' && row.continuation_attempt_no >= MAX_NCM_CONTINUATION_ATTEMPTS) {
        return { kind: 'limit_reached' as const, reservation: row }
      }
      return { kind: 'in_progress' as const, reservation: row }
    }
    row = await this.getReservationForUser(owner, id)
    if (!row) return { kind: 'not_found' as const }
    return { kind: 'started' as const, reservation: row }
  }

  async reopenContinuation(userId: string, reservationId: string, response: StoredResponse) {
    const body = required('response.body', response.body, MAX.responseBody)
    const contentType = required('response.contentType', response.contentType || 'application/json; charset=utf-8', MAX.responseContentType)
    const now = this.now()
    const result = await run(this.db,
      `UPDATE credit_reservations
       SET status = 'continuation_ready', lease_expires_at = ?,
           continuation_response_status = ?, continuation_response_content_type = ?, continuation_response_body = ?,
           updated_at = ?
       WHERE id = ? AND user_id = ? AND status = 'continuation_running'
         AND continuation_attempt_no < ?`,
      [this.lease(), response.status, contentType, body, now, required('reservationId', reservationId, MAX.id), required('userId', userId, MAX.id), MAX_NCM_CONTINUATION_ATTEMPTS],
    )
    return result.meta?.changes ?? 0
  }

  async settleContinuation(userId: string, reservationId: string, response: StoredResponse) {
    const body = required('response.body', response.body, MAX.responseBody)
    const contentType = required('response.contentType', response.contentType || 'application/json; charset=utf-8', MAX.responseContentType)
    const now = this.now()
    const result = await run(this.db,
      `UPDATE credit_reservations
       SET status = 'settled', continuation_response_status = ?, continuation_response_content_type = ?, continuation_response_body = ?,
           settled_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND status = 'continuation_running'`,
      [response.status, contentType, body, now, now, required('reservationId', reservationId, MAX.id), required('userId', userId, MAX.id)],
    )
    return result.meta?.changes ?? 0
  }

  async release(userId: string, reservationId: string, errorCode = 'operation_failed') {
    const now = this.now()
    const result = await run(this.db,
      `UPDATE credit_reservations
       SET status = 'released', last_error_code = ?, released_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ?
         AND status IN ('running', 'continuation_ready', 'continuation_running')`,
      [required('errorCode', errorCode, MAX.errorCode), now, now, required('reservationId', reservationId, MAX.id), required('userId', userId, MAX.id)],
    )
    return result.meta?.changes ?? 0
  }

  initialResponse(row: CreditReservationRow) {
    return storedResponse(row.initial_response_status, row.initial_response_content_type, row.initial_response_body)
  }

  continuationResponse(row: CreditReservationRow) {
    return storedResponse(row.continuation_response_status, row.continuation_response_content_type, row.continuation_response_body)
  }
}
