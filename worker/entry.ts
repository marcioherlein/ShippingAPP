import app from './router'
import { authorizeRequest } from './auth'
import { withRequestContext } from './requestContext'
import { analyzeAlibabaSelfFirst, parseAlibabaSelfFirstUrl } from './alibabaSelfFirst'
import { analyzeArgentinaMarketHybrid } from './argentinaMarketOrchestrator'
import { resolveMercadoLibreAccessToken } from './mercadoLibreAuth'
import { handleAnalysisHistory, isAnalysisHistoryRoute } from './analysisHistory'
import { overlayHybridMarketEconomics } from './hybridMarketEconomics'
import { handleWatchlist, isWatchlistRoute } from './watchlist'
import { withUsageEntitlement } from './usage'
import { handleApplicationEmail, isApplicationEmailRoute } from './emailPreferences'
import { emailRuntimeStatus } from './emailService'
import { syncClerkProfile } from './clerkProfile'

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

  if (url.pathname === '/api/argentina-market/benchmark' && request.method === 'POST') {
    return hybridMarketBenchmark(request, env)
  }

  // Normal Alibaba analysis is self-scrape first. Parse.bot is now only an
  // optional supplement when first-party HTML/JSON does not complete the
  // mandatory product ficha. Explicit diagnostic sourceMode requests keep
  // using the existing router probes unchanged.
  if (url.pathname === '/api/analyze' && request.method === 'POST') {
    let body: any = null
    try { body = await request.clone().json() } catch { body = null }
    const alibabaUrl = !body?.sourceMode ? parseAlibabaSelfFirstUrl(body?.url) : null
    if (alibabaUrl) {
      try {
        // Self-first still owns Alibaba extraction + FX hydration, but its
        // legacy ML-only hydration must not see provider credentials. The
        // authoritative hybrid overlay immediately below gets the original
        // env and performs the single real Argentina-market lookup.
        const selfFirstEnv = withoutLegacyMarketCredentials(env, '/api/analyze')
        const analysis = await analyzeAlibabaSelfFirst(alibabaUrl, selfFirstEnv as any)
        return Response.json(await overlayHybridMarketEconomics(analysis, env as any))
      } catch {
        // Reliability backstop: if the new orchestrator itself fails, keep
        // the previous router pipeline available rather than dropping the case.
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
}
