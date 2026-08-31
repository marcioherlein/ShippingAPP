import app from './router'
import { authorizeRequest } from './auth'
import { withRequestContext } from './requestContext'
import { analyzeAlibabaSelfFirst, parseAlibabaSelfFirstUrl } from './alibabaSelfFirst'
import { analyzeArgentinaMarketHybrid } from './argentinaMarketOrchestrator'
import { resolveMercadoLibreAccessToken } from './mercadoLibreAuth'
import { handleAnalysisHistory, isAnalysisHistoryRoute } from './analysisHistory'
import { overlayHybridMarketEconomics } from './hybridMarketEconomics'

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

  return Response.json(body, { status: response.status })
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
        return Response.json({ authenticated: true, accountId: gate.identity.userId })
      }

      if (isAnalysisHistoryRoute(url.pathname)) {
        return handleAnalysisHistory(gate.request, env as any)
      }

      if (url.pathname === '/api/argentina-market/benchmark' && gate.request.method === 'POST') {
        return hybridMarketBenchmark(gate.request, env)
      }

      // Normal Alibaba analysis is self-scrape first. Parse.bot is now only an
      // optional supplement when first-party HTML/JSON does not complete the
      // mandatory product ficha. Explicit diagnostic sourceMode requests keep
      // using the existing router probes unchanged.
      if (url.pathname === '/api/analyze' && gate.request.method === 'POST') {
        let body: any = null
        try { body = await gate.request.clone().json() } catch { body = null }
        const alibabaUrl = !body?.sourceMode ? parseAlibabaSelfFirstUrl(body?.url) : null
        if (alibabaUrl) {
          try {
            const analysis = await analyzeAlibabaSelfFirst(alibabaUrl, env as any)
            return Response.json(await overlayHybridMarketEconomics(analysis, env as any))
          } catch {
            // Reliability backstop: if the new orchestrator itself fails, keep
            // the previous router pipeline available rather than dropping the case.
          }
        }
      }

      const response = await app.fetch(gate.request, env as never)
      if (gate.request.method === 'POST' && url.pathname === '/api/analyze') {
        return overlayUserAnalysisResponse(response, '/api/analyze', env)
      }
      if (gate.request.method === 'POST' && url.pathname === '/api/intake') {
        return overlayUserAnalysisResponse(response, '/api/intake', env)
      }
      return response
    })
  },
}
