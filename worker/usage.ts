import type { AuthIdentity } from './auth'
import type { D1DatabaseLike } from './persistence/d1'
import {
  MAX_NCM_CONTINUATION_ATTEMPTS,
  UsageRepository,
  type CreditReservationRow,
  type StoredResponse,
  type UsageView,
} from './persistence/usageRepository'
import { API_ROUTE_POLICIES, resolveRoutePolicy } from './routePolicy'

export const USAGE_RESERVATION_HEADER = 'x-shippingapp-usage-reservation'
export const USAGE_CHANGED_HEADER = 'x-shippingapp-usage-changed'
export const USAGE_REPLAYED_HEADER = 'x-shippingapp-idempotency-replayed'
export const CREDITS_REMAINING_HEADER = 'x-shippingapp-credits-remaining'
const IDEMPOTENCY_HEADER = 'idempotency-key'
const MAX_STORED_RESPONSE_BYTES = 1024 * 1024

type Env = Record<string, unknown> & { DB?: D1DatabaseLike }
type Dispatch = () => Promise<Response>

type InitialRule = {
  mode: 'standalone' | 'full_start'
  routeId: string
  credits: 1
}
type ContinuationRule = {
  mode: 'continuation'
  routeId: string
  credits: 0
}
export type MeteringRule = InitialRule | ContinuationRule

export const METERING_RULES: Readonly<Record<string, MeteringRule>> = {
  'watchlist-refresh': { mode: 'standalone', routeId: 'watchlist-refresh', credits: 1 },
  'mercadolibre-benchmark': { mode: 'standalone', routeId: 'mercadolibre-benchmark', credits: 1 },
  'argentina-market-benchmark': { mode: 'standalone', routeId: 'argentina-market-benchmark', credits: 1 },
  'opportunity-search': { mode: 'standalone', routeId: 'opportunity-search', credits: 1 },
  discover: { mode: 'standalone', routeId: 'discover', credits: 1 },
  analyze: { mode: 'full_start', routeId: 'analyze', credits: 1 },
  intake: { mode: 'full_start', routeId: 'intake', credits: 1 },
  'ncm-classify': { mode: 'continuation', routeId: 'ncm-classify', credits: 0 },
}

function json(body: unknown, status = 200, headers?: HeadersInit) {
  const next = new Headers(headers)
  next.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), { status, headers: next })
}

function validIdempotencyKey(request: Request) {
  const raw = request.headers.get(IDEMPOTENCY_HEADER)?.trim() || ''
  return raw.length >= 8 && raw.length <= 120 ? raw : null
}

function responseFromStored(stored: StoredResponse, reservation: CreditReservationRow, remaining: number, replayed = true) {
  const headers = new Headers({ 'content-type': stored.contentType })
  headers.set(USAGE_RESERVATION_HEADER, reservation.id)
  headers.set(CREDITS_REMAINING_HEADER, String(remaining))
  if (replayed) headers.set(USAGE_REPLAYED_HEADER, 'true')
  return new Response(stored.body, { status: stored.status, headers })
}

function withUsageHeaders(response: Response, reservation: CreditReservationRow | null, usage: UsageView, changed = true) {
  const headers = new Headers(response.headers)
  if (reservation) headers.set(USAGE_RESERVATION_HEADER, reservation.id)
  headers.set(CREDITS_REMAINING_HEADER, String(usage.period.creditsRemaining))
  if (changed) headers.set(USAGE_CHANGED_HEADER, '1')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

async function captureResponse(response: Response): Promise<StoredResponse | null> {
  const clone = response.clone()
  const body = await clone.text()
  if (new TextEncoder().encode(body).byteLength > MAX_STORED_RESPONSE_BYTES) return null
  return {
    status: response.status,
    contentType: response.headers.get('content-type') || 'application/json; charset=utf-8',
    body,
  }
}

async function parseJson(response: Response) {
  try { return await response.clone().json() as any } catch { return null }
}

async function standaloneSucceeded(routeId: string, response: Response) {
  if (!response.ok) return false
  if (routeId === 'argentina-market-benchmark') {
    const body = await parseJson(response)
    return body?.market?.status === 'live'
  }
  if (routeId === 'mercadolibre-benchmark') {
    const body = await parseJson(response)
    return body?.status === 'live' || body?.market?.status === 'live'
  }
  if (routeId === 'watchlist-refresh') {
    const body = await parseJson(response)
    const status = body?.item?.latestSnapshot?.marketStatus
    return typeof status === 'string' && !['unavailable', 'insufficient', 'configuration_required', 'unknown'].includes(status)
  }
  return true
}

async function fullStartHasAnalysis(routeId: string, response: Response) {
  if (!response.ok) return false
  const body = await parseJson(response)
  if (routeId === 'intake') return Boolean(body?.analysis?.product)
  return Boolean(body?.product)
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase()
  return normalized || null
}

function weakIdentity(value: string | null) {
  return !value || ['sin clasificar', 'producto alibaba', 'unknown', 'desconocido', 'pendiente'].includes(value)
}

function compatibleStableIdentity(actualValue: unknown, expectedValue: unknown) {
  const actual = normalizeText(actualValue)
  const expected = normalizeText(expectedValue)
  if (weakIdentity(expected)) return Boolean(actual)
  if (!actual || !expected) return false
  if (actual === expected) return true
  return actual.includes(expected) || expected.includes(actual)
}

function initialProductFromReservation(row: CreditReservationRow) {
  const stored = row.initial_response_body
  if (!stored) return null
  try {
    const body = JSON.parse(stored) as any
    return body?.analysis?.product ?? body?.product ?? null
  } catch {
    return null
  }
}

async function continuationMatchesInitial(request: Request, row: CreditReservationRow) {
  const product = initialProductFromReservation(row)
  if (!product) return false
  let facts: any
  try { facts = await request.clone().json() } catch { return false }
  if (!facts || typeof facts !== 'object') return false

  // The reservation stays bound to the same core product, while technical
  // clarifications are intentionally allowed to evolve. This fixes the old
  // deadlock where the UI asked for material/function/description and the
  // backend then rejected those exact edits as a reservation mismatch.
  return compatibleStableIdentity(facts.name, product.name)
    && compatibleStableIdentity(facts.category, product.category)
}

function safeErrorCode(response: Response, fallback: string) {
  if (response.status >= 500) return 'provider_or_internal_failure'
  if (response.status >= 400) return 'request_failed'
  return fallback
}

async function releasedUsage(repo: UsageRepository, userId: string, reservationId: string, code: string) {
  await repo.release(userId, reservationId, code)
  return repo.usageView(userId)
}

function classificationNeedsRefinement(body: any) {
  if (!body || typeof body !== 'object') return false
  return body.status === 'missing' || body.confidence === 'low' || body.confidence === 'missing'
}

async function annotateRefinementResponse(response: Response, attempt: number, allowed: boolean) {
  const body = await parseJson(response)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return response
  const headers = new Headers(response.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify({
    ...body,
    refinement: {
      allowed,
      attempt,
      maxAttempts: MAX_NCM_CONTINUATION_ATTEMPTS,
    },
  }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

async function handleInitial(
  request: Request,
  repo: UsageRepository,
  userId: string,
  rule: InitialRule,
  dispatch: Dispatch,
) {
  const operationKey = validIdempotencyKey(request)
  if (!operationKey) {
    return json({
      error: 'A valid Idempotency-Key header is required for this operation.',
      code: 'invalid_idempotency_key',
    }, 400)
  }

  const begin = await repo.begin({
    userId,
    operationKey,
    routeId: rule.routeId,
    operationKind: rule.mode === 'full_start' ? 'full_analysis' : 'standalone',
    credits: rule.credits,
  })

  if (begin.kind === 'quota_exhausted') {
    return json({
      error: 'No te quedan créditos disponibles en este período.',
      code: 'usage_exhausted',
      usage: begin.usage,
    }, 402, { [CREDITS_REMAINING_HEADER]: '0' })
  }
  if (begin.kind === 'attempt_limit_exhausted') {
    return json({
      error: 'Se alcanzó el límite de reintentos protegidos de este período. Tus créditos normales no se redujeron por los intentos fallidos.',
      code: 'usage_attempt_limit_exhausted',
      usage: begin.usage,
    }, 429, { [CREDITS_REMAINING_HEADER]: String(begin.usage.period.creditsRemaining) })
  }
  if (begin.kind === 'period_expired') {
    return json({
      error: 'Este intento pertenece a un período de uso anterior. Iniciá una operación nueva.',
      code: 'usage_operation_period_expired',
      usage: begin.usage,
    }, 409, { [CREDITS_REMAINING_HEADER]: String(begin.usage.period.creditsRemaining) })
  }
  if (begin.kind === 'collision') {
    return json({ error: 'This idempotency key belongs to a different operation.', code: 'idempotency_collision' }, 409)
  }

  if (begin.kind === 'existing') {
    const row = begin.reservation
    const stored = repo.initialResponse(row)
    if (row.status === 'running' || (row.status === 'continuation_running' && !stored)) {
      return json({ error: 'This operation is already in progress.', code: 'operation_in_progress' }, 409, {
        [USAGE_RESERVATION_HEADER]: row.id,
        [CREDITS_REMAINING_HEADER]: String(begin.usage.period.creditsRemaining),
      })
    }
    if (stored) return responseFromStored(stored, row, begin.usage.period.creditsRemaining)
    return json({ error: 'The prior operation cannot be replayed safely.', code: 'operation_replay_unavailable' }, 409)
  }

  const reservation = begin.reservation
  let response: Response
  try {
    response = await dispatch()
  } catch (error) {
    await repo.release(userId, reservation.id, 'handler_exception')
    throw error
  }

  const stored = await captureResponse(response)
  if (!stored) {
    const usage = await releasedUsage(repo, userId, reservation.id, 'response_too_large')
    return json({ error: 'The operation result could not be stored safely.', code: 'metering_response_too_large' }, 502, {
      [CREDITS_REMAINING_HEADER]: String(usage.period.creditsRemaining),
      [USAGE_CHANGED_HEADER]: '1',
    })
  }

  if (rule.mode === 'standalone') {
    if (!await standaloneSucceeded(rule.routeId, response)) {
      const usage = await releasedUsage(repo, userId, reservation.id, safeErrorCode(response, 'no_usable_result'))
      return withUsageHeaders(response, reservation, usage)
    }
    try {
      if (await repo.settleStandalone(userId, reservation.id, stored) !== 1) throw new Error('standalone_settlement_lost')
    } catch {
      const usage = await releasedUsage(repo, userId, reservation.id, 'settlement_failed')
      return json({ error: 'Usage settlement is temporarily unavailable.', code: 'usage_settlement_failed' }, 503, {
        [CREDITS_REMAINING_HEADER]: String(usage.period.creditsRemaining),
        [USAGE_CHANGED_HEADER]: '1',
      })
    }
    return withUsageHeaders(response, reservation, await repo.usageView(userId))
  }

  if (!await fullStartHasAnalysis(rule.routeId, response)) {
    const usage = await releasedUsage(repo, userId, reservation.id, safeErrorCode(response, 'analysis_not_completed'))
    return withUsageHeaders(response, reservation, usage)
  }

  try {
    if (await repo.markContinuationReady(userId, reservation.id, stored) !== 1) throw new Error('continuation_ready_transition_lost')
  } catch {
    const usage = await releasedUsage(repo, userId, reservation.id, 'continuation_state_failed')
    return json({ error: 'Usage continuation state is temporarily unavailable.', code: 'usage_settlement_failed' }, 503, {
      [CREDITS_REMAINING_HEADER]: String(usage.period.creditsRemaining),
      [USAGE_CHANGED_HEADER]: '1',
    })
  }
  const current = await repo.getReservationForUser(userId, reservation.id)
  return withUsageHeaders(response, current ?? reservation, await repo.usageView(userId))
}

async function handleContinuation(
  request: Request,
  repo: UsageRepository,
  userId: string,
  dispatch: Dispatch,
) {
  const reservationId = request.headers.get(USAGE_RESERVATION_HEADER)?.trim() || ''
  if (!reservationId) {
    return json({ error: 'A full-analysis usage reservation is required.', code: 'usage_reservation_required' }, 409)
  }
  const row = await repo.getReservationForUser(userId, reservationId)
  if (!row) return json({ error: 'Usage reservation not found.', code: 'usage_reservation_not_found' }, 404)
  if (row.operation_kind !== 'full_analysis' || !['analyze', 'intake'].includes(row.route_id)) {
    return json({ error: 'Usage reservation cannot authorize this continuation.', code: 'usage_reservation_invalid' }, 409)
  }
  if (!await continuationMatchesInitial(request, row)) {
    return json({ error: 'The classification continuation does not match the reserved product.', code: 'usage_continuation_mismatch' }, 409)
  }

  const claim = await repo.claimContinuation(userId, reservationId)
  if (claim.kind === 'not_found') return json({ error: 'Usage reservation not found.', code: 'usage_reservation_not_found' }, 404)
  if (claim.kind === 'invalid') return json({ error: 'Usage reservation cannot authorize this continuation.', code: 'usage_reservation_invalid' }, 409)
  if (claim.kind === 'released') return json({ error: 'This usage reservation was released.', code: 'usage_reservation_released' }, 409)
  if (claim.kind === 'limit_reached') {
    return json({
      error: 'Se alcanzó el máximo de aclaraciones automáticas para este producto. Revisá la identidad o iniciá un caso nuevo.',
      code: 'usage_continuation_limit_reached',
      refinement: { allowed: false, attempt: claim.reservation.continuation_attempt_no, maxAttempts: MAX_NCM_CONTINUATION_ATTEMPTS },
    }, 409, { [USAGE_RESERVATION_HEADER]: claim.reservation.id })
  }
  if (claim.kind === 'in_progress') return json({ error: 'This continuation is already in progress.', code: 'operation_in_progress' }, 409)
  if (claim.kind === 'settled') {
    const stored = repo.continuationResponse(claim.reservation)
    if (!stored) return json({ error: 'Settled continuation result is unavailable.', code: 'operation_replay_unavailable' }, 409)
    const usage = await repo.usageView(userId)
    return responseFromStored(stored, claim.reservation, usage.period.creditsRemaining)
  }

  let rawResponse: Response
  try {
    rawResponse = await dispatch()
  } catch (error) {
    await repo.release(userId, reservationId, 'continuation_exception')
    throw error
  }

  if (!rawResponse.ok) {
    const usage = await releasedUsage(repo, userId, reservationId, safeErrorCode(rawResponse, 'continuation_failed'))
    return withUsageHeaders(rawResponse, claim.reservation, usage)
  }

  const body = await parseJson(rawResponse)
  const needsRefinement = classificationNeedsRefinement(body)
  const attempt = claim.reservation.continuation_attempt_no
  const refinementAllowed = needsRefinement && attempt < MAX_NCM_CONTINUATION_ATTEMPTS
  const response = await annotateRefinementResponse(rawResponse, attempt, refinementAllowed)
  const stored = await captureResponse(response)
  if (!stored) {
    const usage = await releasedUsage(repo, userId, reservationId, 'continuation_response_too_large')
    return json({ error: 'The classification result could not be stored safely.', code: 'metering_response_too_large' }, 502, {
      [CREDITS_REMAINING_HEADER]: String(usage.period.creditsRemaining),
      [USAGE_CHANGED_HEADER]: '1',
    })
  }

  try {
    if (refinementAllowed) {
      if (await repo.reopenContinuation(userId, reservationId, stored) !== 1) throw new Error('continuation_reopen_lost')
    } else if (await repo.settleContinuation(userId, reservationId, stored) !== 1) {
      throw new Error('continuation_settlement_lost')
    }
  } catch {
    const usage = await releasedUsage(repo, userId, reservationId, 'continuation_settlement_failed')
    return json({ error: 'Usage settlement is temporarily unavailable.', code: 'usage_settlement_failed' }, 503, {
      [CREDITS_REMAINING_HEADER]: String(usage.period.creditsRemaining),
      [USAGE_CHANGED_HEADER]: '1',
    })
  }

  const current = await repo.getReservationForUser(userId, reservationId)
  return withUsageHeaders(response, current ?? claim.reservation, await repo.usageView(userId))
}

export function validateMeteringRuleCoverage() {
  const metered = API_ROUTE_POLICIES.filter((route) => route.targetMetered).map((route) => route.id).sort()
  const rules = Object.keys(METERING_RULES).sort()
  return { metered, rules, complete: JSON.stringify(metered) === JSON.stringify(rules) }
}

export async function withUsageEntitlement(
  request: Request,
  env: Env,
  identity: AuthIdentity | null,
  dispatch: Dispatch,
): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname === '/api/usage' && request.method === 'GET') {
    if (identity?.kind !== 'user') return json({ error: 'Unauthorized.', code: 'unauthorized' }, 401)
    if (!env.DB) return json({ error: 'Usage storage is not configured.', code: 'usage_store_unavailable' }, 503)
    const usage = await new UsageRepository(env.DB).usageView(identity.userId)
    return json({ usage }, 200, { [CREDITS_REMAINING_HEADER]: String(usage.period.creditsRemaining) })
  }

  const policy = resolveRoutePolicy(url.pathname, request.method)
  if (!policy?.targetMetered) return dispatch()

  const rule = METERING_RULES[policy.id]
  if (!rule) return json({ error: 'Usage policy is not configured for this operation.', code: 'usage_policy_missing' }, 503)

  if (identity?.kind === 'service') return dispatch()
  if (identity?.kind !== 'user') return json({ error: 'Unauthorized.', code: 'unauthorized' }, 401)
  if (!env.DB) return json({ error: 'Usage storage is not configured.', code: 'usage_store_unavailable' }, 503)

  const repo = new UsageRepository(env.DB)
  return rule.mode === 'continuation'
    ? handleContinuation(request, repo, identity.userId, dispatch)
    : handleInitial(request, repo, identity.userId, rule, dispatch)
}
