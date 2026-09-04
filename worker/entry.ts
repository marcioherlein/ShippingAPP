import app from './router'
import { authorizeRequest } from './auth'
import { withRequestContext } from './requestContext'
import { analyzeAlibabaSelfFirst, parseAlibabaSelfFirstUrl, resolveAlibabaSelfFirst } from './alibabaSelfFirst'
import { analyzeArgentinaMarketHybrid } from './argentinaMarketOrchestrator'
import { resolveMercadoLibreAccessToken } from './mercadoLibreAuth'
import { fetchBcraReferenceFx } from './bcraFx'
import { handleAnalysisHistory, isAnalysisHistoryRoute } from './analysisHistory'
import { overlayHybridMarketEconomics } from './hybridMarketEconomics'
import { handleWatchlist, isWatchlistRoute } from './watchlist'
import { withUsageEntitlement } from './usage'
import { handleApplicationEmail, isApplicationEmailRoute } from './emailPreferences'
import { emailRuntimeStatus } from './emailService'
import { syncClerkProfile } from './clerkProfile'
import { digestRuntimeStatus, digestSchedulerDryRun } from './weeklyDigest'
import { runWeeklyDigestSchedulerWithLease } from './weeklyDigestLease'
import { productionIdentityStatus } from './productionIdentity'

const LEGACY_MARKET_ENV_KEYS = [
  'MERCADOLIBRE_ACCESS_TOKEN',
  'MERCADOLIBRE_CLIENT_ID',
  'MERCADOLIBRE_CLIENT_SECRET',
  'MERCADOLIBRE_REFRESH_TOKEN',
  'MERCADOLIBRE_TOKEN_STORE',
] as const
const EXPECTED_EMAIL_TEMPLATES = ['alert', 'billing', 'usage', 'weekly_digest', 'welcome']

/**
 * `/api/analyze` and `/api/intake` get their authoritative Argentina benchmark
 * from `overlayHybridMarketEconomics` after the legacy pipeline returns. Hide
 * ML credentials from every inner legacy analysis call — including the Alibaba
 * self-first fast path — so those layers can hydrate non-market facts/FX without
 * performing a second authenticated ML discovery. Dedicated Mercado Libre
 * diagnostics and the outer hybrid benchmark keep the original environment.
 */
export function withoutLegacyMarketCredentials(env: Record<string, unknown>, pathname: string) {
  if (pathname !== '/api/analyze' && pathname !== '/api/intake') return env
  const isolated = { ...env }
  for (const key of LEGACY_MARKET_ENV_KEYS) delete isolated[key]
  return isolated
}

function benchmarkRequest(body: unknown) {
  const raw = body && typeof body === 'object' ? body as any : {}
  const productName = typeof raw.productName === 'string'
    ? raw.productName.trim().replace(/\s+/g, ' ').slice(0, 220)
    : typeof raw.name === 'string'
      ? raw.name.trim().replace(/\s+/g, ' ').slice(0, 220)
      : ''
  const category = typeof raw.category === 'string'
    ? raw.category.trim().replace(/\s+/g, ' ').slice(0, 180)
    : ''
  if ((productName || category).length < 2) return null
  return { productName, category }
}

async function hybridMarketBenchmark(request: Request, env: Record<string, unknown>) {
  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: 'Ingresá un body JSON válido.' }, { status: 400 })
  }
  const parsed = benchmarkRequest(body)
  if (!parsed) return Response.json({ error: 'Ingresá productName/name o category para consultar el mercado argentino.' }, { status: 400 })

  const auth = await resolveMercadoLibreAccessToken(env as any)
  const googleShoppingApiKey = typeof env.SERPAPI_API_KEY === 'string' ? env.SERPAPI_API_KEY : null
  const market = await analyzeArgentinaMarketHybrid(parsed.productName, parsed.category, {
    mercadoLibreAccessToken: auth.accessToken,
    googleShoppingApiKey,
  })

  return Response.json({
    status: market.status,
    query: market.query,
    providers: {
      mercadoLibreAuth: auth.status,
      googleShoppingConfigured: Boolean(googleShoppingApiKey?.trim()),
    },
    market,
  })
}

function jsonResponseLike(response: Response, body: unknown) {
  const headers = new Headers(response.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

async function overlayRuntimeEmailStatus(response: Response, env: Record<string, unknown>) {
  if (!response.ok) return response
  let body: any
  try { body = await response.clone().json() } catch { return response }
  const email = emailRuntimeStatus(env as any)
  const templates = [...email.templates].sort()
  const architectureReady = email.provider === 'resend'
    && JSON.stringify(templates) === JSON.stringify(EXPECTED_EMAIL_TEMPLATES)
  return jsonResponseLike(response, {
    ...body,
    status: body?.status === 'ok' && architectureReady ? 'ok' : 'error',
    checks: {
      ...(body?.checks ?? {}),
      emailArchitecture: {
        ...email,
        architectureReady,
      },
    },
  })
}

async function overlayUserAnalysisResponse(
  response: Response,
  route: '/api/analyze' | '/api/intake',
  env: Record<string, unknown>,
) {
  if (!response.ok) return response
  let body: any
  try { body = await response.clone().json() } catch { return response }

  if (route === '/api/intake') {
    if (!body?.analysis?.product) return response
    body.analysis = await overlayHybridMarketEconomics(body.analysis, env as any)
  } else {
    if (!body?.product) return response
    body = await overlayHybridMarketEconomics(body, env as any)
  }

  return jsonResponseLike(response, body)
}

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
}

function positiveNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function safeImageUrl(value: unknown) {
  const raw = cleanText(value, 2048)
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Build a server-owned analysis shell from a ficha the user already confirmed.
 * Customs fields are deliberately absent: the paid reservation authorizes the
 * subsequent NCM endpoint, which remains fail-closed and tied to this identity.
 */
function confirmedProductAnalysis(body: unknown) {
  const raw = body && typeof body === 'object' ? body as any : null
  const product = raw?.product && typeof raw.product === 'object' ? raw.product : null
  if (!product) return null

  const name = cleanText(product.name, 500)
  if (name.length < 3) return null
  const category = cleanText(product.category, 300)
  const unitPriceUsd = positiveNumber(product.unitPriceUsd) || null
  const moq = positiveNumber(product.moq) || null
  const packedWeightKg = positiveNumber(product.packedWeightKg)
  const volumeCbm = positiveNumber(product.volumeCbm)
  const originCountry = cleanText(product.originCountry, 120)
  const sourceUrl = cleanText(raw.sourceUrl, 2048) || 'manual://product'
  const suggested = Array.isArray(raw.suggestedQuantities)
    ? raw.suggestedQuantities.map(positiveNumber).filter((value: number) => value > 0).slice(0, 12)
    : []
  const suggestedQuantities = [...new Set([...(moq ? [moq] : []), ...suggested])].sort((a, b) => a - b)

  return {
    sourceUrl,
    fetched: raw.fetched === true,
    sourceRead: raw.sourceRead && typeof raw.sourceRead === 'object' ? raw.sourceRead : undefined,
    product: {
      name,
      category,
      unitPriceUsd,
      moq,
      packedWeightKg,
      volumeCbm,
      originCountry,
      imageUrl: safeImageUrl(product.imageUrl),
      material: cleanText(product.material, 500) || null,
      functionText: cleanText(product.functionText, 700) || null,
      description: cleanText(product.description, 1500) || null,
    },
    market: {
      estimatedPriceArs: null,
      estimatedMonthlyDemand: 0,
      source: 'Mercado argentino pendiente del análisis',
    },
    suggestedQuantities,
    confidence: {
      overall: Math.max(60, Math.min(95, Number(raw.confidence?.overall) || 60)),
      productSource: 'Ficha confirmada por el usuario',
      logistics: packedWeightKg > 0 && volumeCbm > 0 ? 'confirmed' : 'missing',
      market: 'pending',
    },
    assumptions: [
      ...(Array.isArray(raw.assumptions) ? raw.assumptions.filter((item: unknown): item is string => typeof item === 'string').slice(0, 20) : []),
      'La ficha fue confirmada por el usuario antes de iniciar el análisis pago. NCM, mercado y economics se resuelven después de esta reserva.',
    ],
  }
}

export async function productRead(
  request: Request,
  env: Record<string, unknown>,
  reader: (url: URL, env: any) => Promise<unknown> = resolveAlibabaSelfFirst,
) {
  let body: any = null
  try { body = await request.json() } catch { body = null }
  const url = parseAlibabaSelfFirstUrl(body?.url)
  if (!url) {
    // An unusable link is a permanent client error, not a transient provider failure.
    return Response.json(
      { error: 'Ingresá un link HTTPS válido de Alibaba.', code: 'invalid_link', retryable: false },
      { status: 400 },
    )
  }

  // Deliberately no market, FX or NCM here — this is only the free supplier-ficha prefill.
  // resolveAlibabaSelfFirst catches provider-level failures internally and returns a partial
  // ficha (the UI then asks for missing fields), so a THROW reaching here is exceptional: a
  // Worker CPU/time limit, an unhandled provider exception, or a transient upstream blip. We
  // give it ONE bounded retry, then surface a structured, retryable error instead of a bare
  // generic 503 so a transient failure never becomes a permanently broken flow.
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await reader(url, env as any)
      return Response.json(data)
    } catch (error) {
      lastError = error
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 400))
    }
  }
  // Provider-stage diagnostic metadata for debugging — no secrets, just the failure class.
  const detail = lastError instanceof Error ? lastError.message.slice(0, 300) : 'unknown error'
  return Response.json(
    {
      error: 'La lectura de Alibaba falló de forma transitoria. Podés reintentar en unos segundos o describir el producto sin link; no se te cobró nada.',
      code: 'transient_provider_error',
      retryable: true,
      stage: 'alibaba_product_read',
      detail,
    },
    { status: 503 },
  )
}

/**
 * Dispatch an already-authenticated request into the existing product/SaaS
 * handlers. Stage 5 wraps this function, so metered routes must reserve quota
 * before this dispatcher is allowed to invoke any external provider work.
 */
async function dispatchAuthorizedRequest(request: Request, env: Record<string, unknown>): Promise<Response> {
  const url = new URL(request.url)

  if (isApplicationEmailRoute(url.pathname)) {
    return handleApplicationEmail(request, env as any)
  }

  if (isAnalysisHistoryRoute(url.pathname)) {
    return handleAnalysisHistory(request, env as any)
  }

  if (isWatchlistRoute(url.pathname)) {
    return handleWatchlist(request, env as any)
  }

  if (url.pathname === '/api/production-readiness' && request.method === 'GET') {
    return Response.json(productionIdentityStatus(env))
  }

  if (url.pathname === '/api/digest-runtime' && request.method === 'GET') {
    return Response.json(await digestRuntimeStatus(env as any))
  }

  if (url.pathname === '/api/digest-dry-run' && request.method === 'POST') {
    return Response.json(await digestSchedulerDryRun(env as any))
  }

  if (url.pathname === '/api/argentina-market/benchmark' && request.method === 'POST') {
    return hybridMarketBenchmark(request, env)
  }

  if (url.pathname === '/api/product-read' && request.method === 'POST') {
    return productRead(request, env)
  }

  // Primary paid path: the product is already identified/confirmed in the UI.
  // Reserve one analysis credit, hydrate market/FX, and then let NCM continue on
  // the same reservation. No supplier scraper is repeated here.
  if (url.pathname === '/api/analyze' && request.method === 'POST') {
    let body: any = null
    try { body = await request.clone().json() } catch { body = null }

    const confirmed = confirmedProductAnalysis(body)
    if (confirmed) {
      const [marketed, fx] = await Promise.all([
        overlayHybridMarketEconomics(confirmed, env as any),
        fetchBcraReferenceFx(),
      ])
      return Response.json({ ...marketed, fx })
    }

    // Legacy direct-link callers remain supported. The new primary journey uses
    // /api/product-read before this point, so a link alone here is compatibility.
    const alibabaUrl = !body?.sourceMode ? parseAlibabaSelfFirstUrl(body?.url) : null
    if (alibabaUrl) {
      try {
        const selfFirstEnv = withoutLegacyMarketCredentials(env, '/api/analyze')
        const analysis = await analyzeAlibabaSelfFirst(alibabaUrl, selfFirstEnv as any)
        return Response.json(await overlayHybridMarketEconomics(analysis, env as any))
      } catch (err) {
        // Reliability backstop: if the new orchestrator itself fails, keep
        // the previous router pipeline available rather than dropping the case.
        console.error(JSON.stringify({ event: 'orchestrator.alibaba_self_first.failed', url: alibabaUrl.toString(), error: err instanceof Error ? err.message : String(err) }))
      }
    }
  }

  const innerEnv = withoutLegacyMarketCredentials(env, url.pathname)
  const response = await app.fetch(request, innerEnv as never)
  if (request.method === 'GET' && url.pathname === '/api/runtime-smoke') {
    return overlayRuntimeEmailStatus(response, env)
  }
  if (request.method === 'POST' && url.pathname === '/api/analyze') {
    return overlayUserAnalysisResponse(response, '/api/analyze', env)
  }
  if (request.method === 'POST' && url.pathname === '/api/intake') {
    return overlayUserAnalysisResponse(response, '/api/intake', env)
  }
  return response
}

export default {
  async fetch(request: Request, env: Record<string, unknown>): Promise<Response> {
    return withRequestContext(request, env, async () => {
      const gate = await authorizeRequest(request, env)
      if (!gate.ok) return gate.response

      const url = new URL(gate.request.url)
      if (url.pathname === '/api/me' && gate.request.method === 'GET') {
        if (gate.identity?.kind !== 'user') {
          return Response.json({ error: 'Authentication rollout is not enabled.', code: 'auth_disabled' }, { status: 404 })
        }
        const profile = await syncClerkProfile(env as any, {
          userId: gate.identity.userId,
          subject: gate.identity.subject,
        })
        return Response.json({
          authenticated: true,
          accountId: gate.identity.userId,
          emailReady: profile.emailReady,
        })
      }

      return withUsageEntitlement(
        gate.request,
        env as any,
        gate.identity,
        () => dispatchAuthorizedRequest(gate.request, env),
      )
    })
  },

  async scheduled(_controller: unknown, env: Record<string, unknown>, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    ctx.waitUntil(runWeeklyDigestSchedulerWithLease(env as any))
  },
}
