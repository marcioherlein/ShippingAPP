export type BillingPlanCode = 'pro' | 'business'

export type BillingProviderSubscription = {
  id: string
  status: string
  externalReference: string | null
  providerPlanId: string | null
  payerEmail: string | null
  payerId: string | null
  version: number | null
  checkoutUrl: string | null
}

export type BillingCheckoutInput = {
  providerPlanId: string
  payerEmail: string
  externalReference: string
  backUrl: string
  idempotencyKey: string
}

export interface BillingProvider {
  readonly name: 'mercadopago'
  readonly configured: boolean
  createSubscription(input: BillingCheckoutInput): Promise<BillingProviderSubscription>
  getSubscription(providerSubscriptionId: string): Promise<BillingProviderSubscription>
  cancelSubscription(providerSubscriptionId: string): Promise<BillingProviderSubscription>
}

export class BillingProviderError extends Error {
  constructor(readonly code: string, readonly status = 502) {
    super(code)
    this.name = 'BillingProviderError'
  }
}

type Env = Record<string, unknown>
type Fetcher = typeof fetch

function textEnv(env: Env, key: string, max = 2048) {
  const raw = env[key]
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  return value && value.length <= max && !/[\r\n]/.test(value) ? value : null
}

function bounded(value: unknown, max: number) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized && normalized.length <= max && !/[\r\n]/.test(normalized) ? normalized : null
}

function validEmail(value: unknown) {
  const text = bounded(value, 320)
  return text && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : null
}

function validHttpsOrigin(value: unknown) {
  const text = bounded(value, 2048)
  if (!text) return null
  try {
    const url = new URL(text)
    return url.protocol === 'https:' && !url.username && !url.password ? url.origin : null
  } catch {
    return null
  }
}

function providerPlanEnvKey(code: BillingPlanCode) {
  return code === 'pro' ? 'MERCADOPAGO_PRO_PLAN_ID' : 'MERCADOPAGO_BUSINESS_PLAN_ID'
}

export function resolveBillingPlanConfiguration(env: Env, code: string) {
  if (code !== 'pro' && code !== 'business') return null
  const planCode = code as BillingPlanCode
  const providerPlanId = textEnv(env, providerPlanEnvKey(planCode), 191)
  return providerPlanId ? { planCode, providerPlanId } : null
}

export function resolveBillingBackUrl(env: Env) {
  return validHttpsOrigin(textEnv(env, 'BILLING_PUBLIC_BASE_URL') ?? textEnv(env, 'APP_PRODUCTION_URL'))
}

function normalizeSubscription(raw: any): BillingProviderSubscription {
  const id = bounded(raw?.id, 191)
  const status = bounded(raw?.status, 80)
  if (!id || !status) throw new BillingProviderError('billing_provider_invalid_response')
  const version = Number(raw?.version)
  const payerId = raw?.payer_id == null ? null : bounded(String(raw.payer_id), 191)
  return {
    id,
    status: status.toLowerCase(),
    externalReference: bounded(raw?.external_reference == null ? null : String(raw.external_reference), 191),
    providerPlanId: bounded(raw?.preapproval_plan_id, 191),
    payerEmail: validEmail(raw?.payer_email),
    payerId,
    version: Number.isSafeInteger(version) && version >= 0 ? version : null,
    checkoutUrl: validHttpsOrigin(raw?.init_point) ? bounded(raw.init_point, 2048) : null,
  }
}

function requestIdempotencyKey(value: string) {
  const normalized = bounded(value, 120)
  if (!normalized || normalized.length < 8) throw new BillingProviderError('billing_idempotency_key_invalid', 400)
  return normalized
}

function safePathId(value: string) {
  const normalized = bounded(value, 191)
  if (!normalized) throw new BillingProviderError('billing_provider_subscription_id_invalid', 400)
  return encodeURIComponent(normalized)
}

export class MercadoPagoBillingProvider implements BillingProvider {
  readonly name = 'mercadopago' as const
  readonly configured: boolean
  private readonly accessToken: string | null

  constructor(private readonly env: Env, private readonly fetcher: Fetcher = fetch) {
    this.accessToken = textEnv(env, 'MERCADOPAGO_BILLING_ACCESS_TOKEN', 1024)
    this.configured = Boolean(this.accessToken)
  }

  private async request(path: string, init: RequestInit = {}) {
    if (!this.accessToken) throw new BillingProviderError('billing_provider_not_configured', 503)
    const headers = new Headers(init.headers)
    headers.set('authorization', `Bearer ${this.accessToken}`)
    headers.set('accept', 'application/json')
    if (init.body) headers.set('content-type', 'application/json')
    let response: Response
    try {
      response = await this.fetcher(`https://api.mercadopago.com${path}`, {
        ...init,
        headers,
        signal: init.signal ?? AbortSignal.timeout(12_000),
      })
    } catch {
      throw new BillingProviderError('billing_provider_unavailable')
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new BillingProviderError('billing_provider_unauthorized', 503)
      if (response.status === 429) throw new BillingProviderError('billing_provider_rate_limited', 503)
      throw new BillingProviderError('billing_provider_rejected')
    }
    try {
      return await response.json()
    } catch {
      throw new BillingProviderError('billing_provider_invalid_response')
    }
  }

  async createSubscription(input: BillingCheckoutInput) {
    const providerPlanId = bounded(input.providerPlanId, 191)
    const payerEmail = validEmail(input.payerEmail)
    const externalReference = bounded(input.externalReference, 191)
    const backUrl = validHttpsOrigin(input.backUrl)
    if (!providerPlanId || !payerEmail || !externalReference || !backUrl) {
      throw new BillingProviderError('billing_checkout_payload_invalid', 400)
    }
    const idempotencyKey = requestIdempotencyKey(input.idempotencyKey)
    const raw = await this.request('/preapproval', {
      method: 'POST',
      headers: { 'x-idempotency-key': idempotencyKey },
      body: JSON.stringify({
        preapproval_plan_id: providerPlanId,
        payer_email: payerEmail,
        external_reference: externalReference,
        back_url: backUrl,
      }),
    })
    return normalizeSubscription(raw)
  }

  async getSubscription(providerSubscriptionId: string) {
    const raw = await this.request(`/preapproval/${safePathId(providerSubscriptionId)}`)
    return normalizeSubscription(raw)
  }

  async cancelSubscription(providerSubscriptionId: string) {
    const raw = await this.request(`/preapproval/${safePathId(providerSubscriptionId)}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'canceled' }),
    })
    return normalizeSubscription(raw)
  }
}

export function createBillingProvider(env: Env, fetcher?: Fetcher): BillingProvider {
  return new MercadoPagoBillingProvider(env, fetcher)
}
