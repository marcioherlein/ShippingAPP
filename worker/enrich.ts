import baseWorker from './index'
import { analyzeArgentinaMarket } from './catalogProvider'
import { resolveMercadoLibreAccessToken, type MercadoLibreAuthEnv, type MercadoLibreAuthResult } from './mercadoLibreAuth'
import { classifyFullNcm, loadNcmIndex, type NcmProductFacts } from './ncmRetrieval'
import { resolveSimOpening } from './simHydration'
import { fetchBcraReferenceFx } from './bcraFx'
import { runImportAnalyst } from './importAnalyst'
import { runConversationalIntake } from './conversationalIntake'
import { discoverAlibabaProducts } from './productDiscovery'
import { describeDiscoveryConstraints, rankDiscoveryResponse } from './discoveryRanking'
import { searchAlibabaOpportunities } from './parsebotOpportunity'
import { proxyProductImage } from './imageProxy'
import type { BrowserRun } from './alibabaSource'

type Env = MercadoLibreAuthEnv & {
  AI: { run: (model: string, input: unknown) => Promise<unknown> }
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  BROWSER: BrowserRun
  PARSEBOT_API_KEY?: string
  PARSEBOT_ENDPOINT_URL?: string
  PARSEBOT_SCRAPER_ID?: string
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
})

const html = (body: string, status = 200) => new Response(body, {
  status,
  headers: { 'content-type': 'text/html; charset=utf-8' },
})

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] || char))
}

function mercadoLibreOAuthCallbackPage(url: URL) {
  const code = url.searchParams.get('code')?.trim() || ''
  const error = url.searchParams.get('error')?.trim() || ''
  const errorDescription = url.searchParams.get('error_description')?.trim() || ''
  if (error) {
    return html(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>MercadoLibre OAuth</title><main style="font-family:system-ui;padding:32px;max-width:760px;margin:auto"><h1>MercadoLibre no autorizó la app</h1><p><b>Error:</b> ${escapeHtml(error)}</p><p>${escapeHtml(errorDescription || 'Volvé a intentar la autorización.')}</p></main>`, 400)
  }
  if (!code) {
    return html(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>MercadoLibre OAuth</title><main style="font-family:system-ui;padding:32px;max-width:760px;margin:auto"><h1>Falta el code de MercadoLibre</h1><p>Esta URL funciona como callback, pero MercadoLibre todavía no devolvió el parámetro <code>code</code>.</p></main>`, 400)
  }
  const safeCode = escapeHtml(code)
  return html(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>MercadoLibre OAuth code</title><main style="font-family:system-ui;padding:32px;max-width:760px;margin:auto"><h1>MercadoLibre autorizó ShippingAPP</h1><p>Copiá este <b>code</b>. No es el client secret ni el access token.</p><pre style="white-space:pre-wrap;word-break:break-all;background:#f4f4f5;border:1px solid #ddd;border-radius:12px;padding:16px">${safeCode}</pre><p>Después pegalo donde vayas a ejecutar el intercambio por tokens. El code vence rápido.</p></main>`)
}

async function mercadoLibreNotifications(request: Request) {
  let payload: unknown = null
  if (request.method === 'POST') {
    try { payload = await request.clone().json() } catch { payload = null }
  }
  return json({
    status: 'ok',
    service: 'ShippingAPP MercadoLibre notifications webhook',
    accepted: request.method === 'POST',
    receivedAt: new Date().toISOString(),
    payloadSeen: Boolean(payload),
    note: 'Webhook endpoint acknowledged. ShippingAPP does not process MercadoLibre notifications yet.',
  })
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  }) as Promise<T>
}

function validFacts(body: any): NcmProductFacts | null {
  if (!body || typeof body !== 'object') return null
  const facts: NcmProductFacts = {
    name: typeof body.name === 'string' ? body.name.slice(0, 500) : null,
    category: typeof body.category === 'string' ? body.category.slice(0, 300) : null,
    material: typeof body.material === 'string' ? body.material.slice(0, 500) : null,
    functionText: typeof body.functionText === 'string' ? body.functionText.slice(0, 700) : null,
    description: typeof body.description === 'string' ? body.description.slice(0, 1500) : null,
  }
  return facts.name || facts.category || facts.description ? facts : null
}

function discoveryRequest(body: unknown) {
  const raw = body && typeof body === 'object' ? body as any : {}
  const query = typeof raw.query === 'string' ? raw.query.trim().replace(/\s+/g, ' ').slice(0, 220) : ''
  const userText = typeof raw.userText === 'string' ? raw.userText.trim().replace(/\s+/g, ' ').slice(0, 500) : query
  return query.length >= 2 ? { query, userText: userText || query } : null
}

function opportunitySearchRequest(body: unknown) {
  const raw = body && typeof body === 'object' ? body as any : {}
  const query = typeof raw.query === 'string' ? raw.query.trim().replace(/\s+/g, ' ').slice(0, 220) : ''
  const userText = typeof raw.userText === 'string' ? raw.userText.trim().replace(/\s+/g, ' ').slice(0, 500) : query
  const page = typeof raw.page === 'number' ? raw.page : 1
  const limit = typeof raw.limit === 'number' ? raw.limit : 12
  const sort = typeof raw.sort === 'string' ? raw.sort : 'best_match'
  return query.length >= 2 ? { query, userText: userText || query, page, limit, sort } : null
}

function marketBenchmarkRequest(body: unknown) {
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

function hasKvStore(env: Env) {
  return typeof env.MERCADOLIBRE_TOKEN_STORE?.get === 'function' && typeof env.MERCADOLIBRE_TOKEN_STORE?.put === 'function'
}

type MercadoLibreApiAccess =
  | { status: 'not_checked'; ok: false; reason: string }
  | { status: 'ok'; ok: true; endpoint: string }
  | { status: 'forbidden' | 'unavailable'; ok: false; endpoint: string; httpStatus?: number; reason: string }

async function checkMercadoLibreApiAccess(auth: MercadoLibreAuthResult): Promise<MercadoLibreApiAccess> {
  if (auth.status !== 'ready') {
    return { status: 'not_checked', ok: false, reason: 'No access token available to validate against Mercado Libre.' }
  }
  const endpoint = 'https://api.mercadolibre.com/users/me'
  try {
    const response = await withTimeout(fetch(endpoint, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${auth.accessToken}`,
        'user-agent': 'ShippingAPP/1.8',
      },
    }), 5000, 'Mercado Libre identity check timeout')
    if (response.ok) return { status: 'ok', ok: true, endpoint: '/users/me' }
    const reason = response.status === 401 || response.status === 403
      ? 'Mercado Libre rejected the loaded token for authenticated API calls. Reauthorize the app after confirming permissions/scopes.'
      : `Mercado Libre identity check returned HTTP ${response.status}.`
    return {
      status: response.status === 401 || response.status === 403 ? 'forbidden' : 'unavailable',
      ok: false,
      endpoint: '/users/me',
      httpStatus: response.status,
      reason,
    }
  } catch (error) {
    return {
      status: 'unavailable',
      ok: false,
      endpoint: '/users/me',
      reason: error instanceof Error ? error.message : 'Mercado Libre identity check failed',
    }
  }
}

function mercadoLibreAuthStatus(auth: MercadoLibreAuthResult, env: Env, apiAccess?: MercadoLibreApiAccess) {
  return {
    status: auth.status,
    ready: auth.status === 'ready',
    apiReady: apiAccess ? apiAccess.ok : auth.status === 'ready',
    tokenSource: auth.source,
    authMode: auth.source === 'static_access_token'
      ? 'temporary_access_token_secret'
      : auth.source === 'token_store' || auth.source === 'refresh'
        ? 'oauth_refresh_with_kv'
        : 'not_ready',
    kvBindingPresent: hasKvStore(env),
    required: auth.status === 'ready' ? [] : [
      'MERCADOLIBRE_CLIENT_ID',
      'MERCADOLIBRE_CLIENT_SECRET',
      'MERCADOLIBRE_REFRESH_TOKEN',
      'MERCADOLIBRE_TOKEN_STORE',
    ],
    ...(apiAccess ? { apiAccess } : {}),
    ...(auth.status === 'ready' ? {} : { reason: auth.reason }),
  }
}

async function smokeAsset(baseUrl: string, env: Env, assetPath: string) {
  const response = await env.ASSETS.fetch(new Request(new URL(assetPath, baseUrl).toString()))
  if (!response.ok) throw new Error(`${assetPath} returned ${response.status}`)
  return response.json() as Promise<any>
}

async function runtimeSmoke(baseUrl: string, env: Env) {
  const ncm = await smokeAsset(baseUrl, env, '/data/ncm-index.json')
  const sim95 = await smokeAsset(baseUrl, env, '/data/sim/95.json')
  const ncmRecords = Array.isArray(ncm?.records) ? ncm.records.length : 0
  const sim95Records = Array.isArray(sim95?.records) ? sim95.records.length : 0

  const ncmIsLegacyArca = ncm?.meta?.source === 'ARCA Arancel Integrado'
    && ncm?.meta?.sourceDate === '2026-08-14'
    && ncm?.meta?.tariffDataIncluded === false
  const ncmIsAppTariffAsset = ncm?.meta?.source === 'NCM_APP.xlsx'
    && ncm?.meta?.sourceFile === 'NCM_APP.xlsx'
    && ncm?.meta?.indexSchema === 4
    && ncm?.meta?.tariffDataIncluded === true
  if (!ncmIsLegacyArca && !ncmIsAppTariffAsset) {
    throw new Error(`NCM asset metadata mismatch: source=${ncm?.meta?.source ?? 'missing'} sourceDate=${ncm?.meta?.sourceDate ?? 'missing'} schema=${ncm?.meta?.indexSchema ?? 'missing'} tariffDataIncluded=${ncm?.meta?.tariffDataIncluded ?? 'missing'}`)
  }
  if (ncmRecords < 10000) throw new Error(`NCM asset unexpectedly small: ${ncmRecords}`)
  if (ncmIsAppTariffAsset && !Array.isArray(ncm.records?.[0]) || (ncmIsAppTariffAsset && ncm.records[0].length !== 12)) {
    throw new Error('NCM_APP asset row shape mismatch')
  }
  if (sim95?.meta?.chapter !== '95') throw new Error('SIM chapter 95 metadata mismatch')
  if (sim95?.meta?.sourceDate !== '2026-08-14') throw new Error('SIM chapter 95 sourceDate mismatch')
  if (sim95Records < 1) throw new Error('SIM chapter 95 has no records')

  return {
    status: 'ok',
    runtime: 'cloudflare-worker',
    checks: {
      workerResponded: true,
      assetsBinding: typeof env.ASSETS?.fetch === 'function',
      aiBindingShape: typeof env.AI?.run === 'function',
      browserBindingPresent: Boolean(env.BROWSER),
      ncmIndex: {
        source: ncm.meta.source,
        sourceDate: ncm.meta.sourceDate,
        records: ncmRecords,
        tariffDataIncluded: ncm.meta.tariffDataIncluded,
      },
      simChapter95: {
        source: sim95.meta.source,
        sourceDate: sim95.meta.sourceDate,
        records: sim95Records,
        tariffDataIncluded: sim95.meta.tariffDataIncluded,
      },
    },
  }
}

async function hydrateMarketAndFx(data: any, env: Env) {
  const mlAuth = await resolveMercadoLibreAccessToken(env)
  const [market, fx] = await Promise.all([
    analyzeArgentinaMarket(data.product?.name || '', data.product?.category || '', {
      accessToken: mlAuth.accessToken,
    }),
    fetchBcraReferenceFx(),
  ])
  if (mlAuth.status !== 'ready') {
    market.warnings.push(mlAuth.reason)
    if (mlAuth.status === 'unavailable') {
      market.status = 'unavailable'
      market.source = 'Mercado Libre Argentina API · OAuth unavailable'
    }
  }

  const prior = (data.assumptions || []).filter((item: string) => !item.includes('Precio argentino inicial estimado'))

  if (market.status !== 'live' || !market.suggestedPriceArs) {
    data.market = { ...data.market, estimatedPriceArs: null, source: `${market.source} · ${market.status}`, details: market }
    data.assumptions = [
      ...prior,
      market.status === 'configuration_required'
        ? 'Mercado local bloqueado: falta configurar la autenticación oficial de Mercado Libre; ShippingAPP no promueve un precio público no autenticado a economics.'
        : 'Mercado local no confirmado: no se reutiliza el benchmark histórico.',
    ]
  } else {
    data.market = { ...data.market, estimatedPriceArs: Math.round(market.suggestedPriceArs), source: market.source, details: market }
    data.assumptions = [
      ...prior,
      `Precio local de screening basado en ${market.comparableCount} comparables activos; ${market.effectivePriceCount} con sale_price efectivo.`,
      'La demanda mensual sigue siendo un supuesto editable; no se infiere del stock público.',
    ]
    data.confidence = { ...data.confidence, market: `live-${market.confidence}` }
  }

  data.fx = fx
  data.assumptions = [
    ...data.assumptions,
    fx.status === 'live' && fx.arsPerUsd
      ? `FX de screening: ARS ${fx.arsPerUsd.toFixed(4)}/USD · BCRA REF Comunicación A 3500 · ${fx.sourceDate}.`
      : 'FX BCRA REF no disponible: economics bloqueado; no se reutiliza una tasa anterior.',
  ]
  return data
}

export function conversationalAnalysis(intake: Awaited<ReturnType<typeof runConversationalIntake>>) {
  const facts = intake.facts
  const benchmarked = Object.values(intake.factSources).filter((source) => source === 'benchmark').length
  const explicit = Object.values(intake.factSources).filter((source) => source === 'user').length
  const overall = Math.max(40, Math.min(65, 45 + explicit * 6 - benchmarked * 4 + (facts.originCountry ? 3 : 0)))

  return {
    sourceUrl: `chat://product-intake/${Date.now()}`,
    fetched: false,
    product: {
      name: facts.name || facts.category || 'Producto descrito por el usuario',
      category: facts.category || 'Sin clasificar',
      unitPriceUsd: facts.unitPriceUsd,
      moq: facts.moq,
      packedWeightKg: facts.packedWeightKg || 0,
      volumeCbm: facts.volumeCbm || 0,
      originCountry: facts.originCountry || '',
      imageUrl: null,
      material: facts.material,
      functionText: facts.functionText,
      description: facts.description,
    },
    market: { estimatedPriceArs: null, estimatedMonthlyDemand: 0, source: 'Conversational intake · market pending' },
    suggestedQuantities: intake.suggestedQuantities,
    confidence: {
      overall,
      productSource: 'user-supplied-unverified',
      logistics: benchmarked ? 'mixed-user-benchmark' : 'user-supplied-unverified',
      market: 'pending',
    },
    assumptions: [
      'Producto y datos comerciales estructurados desde una conversación del usuario; ShippingAPP no los verificó contra una publicación o proforma.',
      'La confidence del producto conversacional está limitada hasta corroborar los datos comerciales con una fuente de proveedor.',
      ...intake.assumptions,
      ...(facts.originCountry ? [] : ['País de origen no verificado; no se presume China ni tratamiento preferencial.']),
      'Demanda mensual no observada: debe ser informada explícitamente antes de recomendar cantidad.',
    ],
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/image-proxy' && (request.method === 'GET' || request.method === 'HEAD')) {
      return proxyProductImage(request)
    }

    if (url.pathname === '/api/runtime-smoke' && request.method === 'GET') {
      try {
        return json(await runtimeSmoke(request.url, env))
      } catch (error) {
        return json({
          status: 'fail',
          runtime: 'cloudflare-worker',
          error: error instanceof Error ? error.message : 'unknown error',
        }, 503)
      }
    }

    if ((url.pathname === '/oauth/mercadolibre/callback' || url.pathname === '/api/mercadolibre/callback') && request.method === 'GET') {
      return mercadoLibreOAuthCallbackPage(url)
    }

    if (url.pathname === '/api/mercadolibre/notifications' && (request.method === 'GET' || request.method === 'POST')) {
      return mercadoLibreNotifications(request)
    }

    if (url.pathname === '/api/mercadolibre/status' && request.method === 'GET') {
      const auth = await resolveMercadoLibreAccessToken(env)
      const apiAccess = await checkMercadoLibreApiAccess(auth)
      return json({
        service: 'Mercado Libre Argentina API',
        auth: mercadoLibreAuthStatus(auth, env, apiAccess),
      })
    }

    if (url.pathname === '/api/mercadolibre/benchmark' && request.method === 'POST') {
      try {
        const parsed = marketBenchmarkRequest(await request.json())
        if (!parsed) return json({ error: 'Ingresá productName/name o category para consultar MercadoLibre.' }, 400)
        const auth = await resolveMercadoLibreAccessToken(env)
        const market = await analyzeArgentinaMarket(parsed.productName, parsed.category, { accessToken: auth.accessToken })
        if (auth.status !== 'ready') market.warnings.push(auth.reason)
        if (auth.status === 'unavailable') {
          market.status = 'unavailable'
          market.source = 'Mercado Libre Argentina API · OAuth unavailable'
        }
        return json({
          status: market.status,
          query: market.query,
          auth: mercadoLibreAuthStatus(auth, env),
          market,
        })
      } catch (error) {
        return json({
          error: 'No pudimos consultar MercadoLibre.',
          detail: error instanceof Error ? error.message : 'unknown error',
        }, 503)
      }
    }

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      try {
        const result = await runImportAnalyst(env.AI, await request.json())
        return json(result.body, result.status)
      } catch {
        return json({ error: 'La solicitud del AI Import Analyst no es válida.' }, 400)
      }
    }

    if (url.pathname === '/api/intake' && request.method === 'POST') {
      try {
        const intake = await runConversationalIntake(env.AI, await request.json())
        if (intake.status !== 'ready') return json(intake)
        const analysis = await hydrateMarketAndFx(conversationalAnalysis(intake), env)
        return json({ ...intake, analysis })
      } catch {
        return json({ error: 'No pudimos procesar el intake conversacional.' }, 400)
      }
    }

    if (url.pathname === '/api/opportunity-search' && request.method === 'POST') {
      try {
        const parsed = opportunitySearchRequest(await request.json())
        if (!parsed) return json({ error: 'Ingresá una búsqueda de producto válida.' }, 400)
        const result = await searchAlibabaOpportunities(parsed.query, env, {
          page: parsed.page,
          sort: parsed.sort,
          limit: parsed.limit,
        })
        const { constraints, constraintsNote } = describeDiscoveryConstraints(parsed.userText)
        return json({
          ...result,
          constraints,
          constraintsNote,
        })
      } catch (error) {
        return json({
          error: 'No pudimos ejecutar la búsqueda Parse.bot de Alibaba.',
          detail: error instanceof Error ? error.message : 'unknown error',
        }, 503)
      }
    }

    if (url.pathname === '/api/discover' && request.method === 'POST') {
      try {
        const parsed = discoveryRequest(await request.json())
        if (!parsed) return json({ error: 'Ingresá una búsqueda de producto válida.' }, 400)
        const source = await discoverAlibabaProducts(parsed.query, env.BROWSER)
        return json(rankDiscoveryResponse(source, parsed.userText))
      } catch {
        return json({ error: 'No pudimos ejecutar la búsqueda live de Alibaba.' }, 503)
      }
    }

    if (url.pathname === '/api/ncm-classify' && request.method === 'POST') {
      try {
        const facts = validFacts(await request.json())
        if (!facts) return json({ error: 'Faltan datos del producto para clasificar.' }, 400)
        const index = await loadNcmIndex(request.url, env.ASSETS)
        const classification = await classifyFullNcm(index, env.AI, facts)
        if (classification.status !== 'candidate' || !classification.code) return json({ ...classification, sim: null })

        try {
          const sim = await withTimeout(
            resolveSimOpening(request.url, env.ASSETS, env.AI, classification.code, facts),
            6000,
            'SIM hydration timeout',
          )
          return json({ ...classification, sim })
        } catch (error) {
          return json({
            ...classification,
            sim: {
              status: 'unavailable', ncmCode: classification.code, ncmLabel: classification.label,
              candidate: null, alternatives: [], confidence: 'missing', missingFacts: [], sourceDate: classification.sourceDate,
              rationale: [`No se pudo hidratar la apertura SIM: ${error instanceof Error ? error.message : 'unknown error'}. La NCM candidata se conserva; no se inventa un sufijo.`],
            },
          })
        }
      } catch (error) {
        return json({
          error: 'No pudimos consultar el índice NCM completo. ShippingAPP debe degradar al clasificador local sin inventar una posición.',
          detail: error instanceof Error ? error.message : 'unknown error',
        }, 503)
      }
    }

    if (url.pathname !== '/api/analyze' || request.method !== 'POST') return baseWorker.fetch(request, env)
    const response = await baseWorker.fetch(request.clone(), env)
    if (!response.ok) return response
    const data = await response.json() as any
    return json(await hydrateMarketAndFx(data, env))
  },
}
