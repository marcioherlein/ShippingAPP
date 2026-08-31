import { readTrustedUserId } from './auth'
import { analyzeArgentinaMarketHybrid } from './argentinaMarketOrchestrator'
import { resolveMercadoLibreAccessToken } from './mercadoLibreAuth'
import type { ArgentinaMarketResult } from './marketTypes'
import { AnalysisHistoryRepository, parseAnalysisHistoryJson, type AnalysisHistoryRow } from './persistence/analysisHistoryRepository'
import type { D1DatabaseLike } from './persistence/d1'
import {
  WatchlistRepository,
  parseWatchlistMetadata,
  parseWatchlistSnapshotPayload,
  type WatchlistItemRow,
  type WatchlistSnapshotRow,
} from './persistence/watchlistRepository'

type Env = Record<string, unknown> & { DB?: D1DatabaseLike; SERPAPI_API_KEY?: string }

type MarketLookup = (productName: string, category: string, env: Env) => Promise<ArgentinaMarketResult>

type WatchlistDependencies = {
  clock?: () => Date
  marketLookup?: MarketLookup
}

type WatchlistBasis = {
  schemaVersion: 1
  productName: string
  category: string
  sourceUrl: string
  analysisId: string
  analysisUpdatedAt: string
  ncmCode: string | null
  unitCostUsd: number | null
  fxArsPerUsd: number | null
  fxObservedAt: string
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
})

function notFound() {
  return json({ error: 'Watchlist item not found.', code: 'watchlist_not_found' }, 404)
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function boundedText(value: unknown, fallback: string, max: number) {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized ? normalized.slice(0, max) : fallback
}

function grossMarginPct(marketPriceArs: number | null, landedCostArs: number | null) {
  if (!marketPriceArs || landedCostArs == null || marketPriceArs <= 0) return null
  return ((marketPriceArs - landedCostArs) / marketPriceArs) * 100
}

function landedCostArs(basis: Pick<WatchlistBasis, 'unitCostUsd' | 'fxArsPerUsd'>) {
  if (!basis.unitCostUsd || !basis.fxArsPerUsd) return null
  return basis.unitCostUsd * basis.fxArsPerUsd
}

function basisFromAnalysis(row: AnalysisHistoryRow): WatchlistBasis {
  const parsed = parseAnalysisHistoryJson(row)
  const input = parsed.input as any
  const result = parsed.result as any
  const analysis = result?.analysis ?? result?.productAnalysis ?? result
  const pipeline = result?.pipelineSummary ?? analysis?.pipelineSummary ?? null
  const productName = boundedText(analysis?.product?.name ?? input?.productName, 'Producto seguido', 240)
  const category = boundedText(analysis?.product?.category, '', 180)
  const rawSourceUrl = analysis?.sourceUrl ?? input?.sourceUrl
  const sourceUrl = boundedText(rawSourceUrl, `analysis://${row.id}`, 2048)
  const fxArsPerUsd = positiveNumber(analysis?.fx?.arsPerUsd ?? result?.fx?.arsPerUsd)
  const unitCostUsd = positiveNumber(pipeline?.unitCostUsd)
  const fxObservedAt = boundedText(
    analysis?.fx?.observedAt ?? analysis?.fx?.asOf ?? analysis?.fx?.date,
    row.updated_at,
    35,
  )

  return {
    schemaVersion: 1,
    productName,
    category,
    sourceUrl,
    analysisId: row.id,
    analysisUpdatedAt: row.updated_at,
    ncmCode: typeof analysis?.customs?.ncmCandidate === 'string' ? analysis.customs.ncmCandidate : null,
    unitCostUsd,
    fxArsPerUsd,
    fxObservedAt,
  }
}

function marketFromAnalysis(row: AnalysisHistoryRow) {
  const parsed = parseAnalysisHistoryJson(row)
  const result = parsed.result as any
  const analysis = result?.analysis ?? result?.productAnalysis ?? result
  const details = analysis?.market?.details ?? null
  const marketPriceArs = positiveNumber(analysis?.market?.estimatedPriceArs)
  return {
    marketPriceArs,
    status: marketPriceArs ? (details?.status ?? 'baseline') : (details?.status ?? 'unavailable'),
    source: boundedText(analysis?.market?.source ?? details?.source, 'analysis-baseline', 240),
    query: typeof details?.query === 'string' ? details.query : null,
    comparableCount: Number.isFinite(details?.comparableCount) ? details.comparableCount : null,
    confidence: Number.isFinite(details?.confidence) ? details.confidence : null,
    comparables: Array.isArray(details?.comparables) ? details.comparables.slice(0, 20) : [],
  }
}

function initialSnapshotPayload(row: AnalysisHistoryRow, basis: WatchlistBasis, observedAt: string) {
  const market = marketFromAnalysis(row)
  const landed = landedCostArs(basis)
  return {
    schemaVersion: 1,
    kind: 'initial',
    grossMarginPct: grossMarginPct(market.marketPriceArs, landed),
    provenance: {
      generatedBy: 'shippingapp-worker',
      observedAt,
      analysis: { id: row.id, updatedAt: row.updated_at },
      market: {
        status: market.status,
        source: market.source,
        query: market.query,
        comparableCount: market.comparableCount,
        confidence: market.confidence,
        comparables: market.comparables,
        sourceObservedAt: row.updated_at,
      },
      landedCost: {
        basis: 'completed-analysis-pipeline',
        unitCostUsd: basis.unitCostUsd,
        fxArsPerUsd: basis.fxArsPerUsd,
        sourceObservedAt: basis.fxObservedAt,
      },
    },
  }
}

function refreshSnapshotPayload(market: ArgentinaMarketResult | null, basis: WatchlistBasis, observedAt: string, providerError?: string) {
  const trustedMarketPrice = market?.status === 'live' ? positiveNumber(market.suggestedPriceArs) : null
  const landed = landedCostArs(basis)
  return {
    schemaVersion: 1,
    kind: 'refresh',
    grossMarginPct: grossMarginPct(trustedMarketPrice, landed),
    provenance: {
      generatedBy: 'shippingapp-worker',
      observedAt,
      market: market ? {
        status: market.status,
        source: market.source,
        query: market.query,
        comparableCount: market.comparableCount,
        confidence: market.confidence,
        priceQuality: market.priceQuality,
        comparables: market.comparables.slice(0, 20),
        warnings: market.warnings,
        sourceObservedAt: observedAt,
      } : {
        status: 'unavailable',
        source: 'provider-error',
        query: basis.productName,
        comparableCount: 0,
        confidence: 0,
        sourceObservedAt: observedAt,
        warnings: providerError ? [providerError] : ['Market provider unavailable.'],
      },
      landedCost: {
        basis: 'completed-analysis-pipeline',
        analysisId: basis.analysisId,
        analysisUpdatedAt: basis.analysisUpdatedAt,
        unitCostUsd: basis.unitCostUsd,
        fxArsPerUsd: basis.fxArsPerUsd,
        sourceObservedAt: basis.fxObservedAt,
      },
    },
  }
}

function snapshotView(row: WatchlistSnapshotRow) {
  const payload = parseWatchlistSnapshotPayload(row) as any
  return {
    id: row.id,
    observedAt: row.observed_at,
    marketPriceArs: row.market_price_ars,
    landedCostArs: row.landed_cost_ars,
    grossMarginPct: typeof payload?.grossMarginPct === 'number' ? payload.grossMarginPct : null,
    kind: payload?.kind ?? 'unknown',
    marketStatus: payload?.provenance?.market?.status ?? 'unknown',
    marketSource: payload?.provenance?.market?.source ?? null,
    provenance: payload?.provenance ?? null,
  }
}

function percentChange(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous <= 0) return null
  return ((current - previous) / previous) * 100
}

function changes(latest: ReturnType<typeof snapshotView> | null, previous: ReturnType<typeof snapshotView> | null) {
  if (!latest || !previous || latest.marketStatus === 'unavailable' || latest.marketStatus === 'insufficient' || latest.marketStatus === 'configuration_required') {
    return { marketPricePct: null, landedCostPct: null, grossMarginPoints: null }
  }
  return {
    marketPricePct: percentChange(latest.marketPriceArs, previous.marketPriceArs),
    landedCostPct: percentChange(latest.landedCostArs, previous.landedCostArs),
    grossMarginPoints: latest.grossMarginPct != null && previous.grossMarginPct != null
      ? latest.grossMarginPct - previous.grossMarginPct
      : null,
  }
}

async function itemView(repo: WatchlistRepository, row: WatchlistItemRow, userId: string, snapshotLimit = 2) {
  const snapshots = await repo.listSnapshotsForUser(userId, row.id, snapshotLimit)
  const mapped = snapshots.map(snapshotView)
  const metadata = parseWatchlistMetadata(row) as WatchlistBasis | null
  return {
    id: row.id,
    analysisId: row.analysis_id,
    title: row.title,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ncmCode: metadata?.ncmCode ?? null,
    latestSnapshot: mapped[0] ?? null,
    previousSnapshot: mapped[1] ?? null,
    changes: changes(mapped[0] ?? null, mapped[1] ?? null),
    snapshots: mapped,
  }
}

async function defaultMarketLookup(productName: string, category: string, env: Env) {
  const auth = await resolveMercadoLibreAccessToken(env as any)
  const googleShoppingApiKey = typeof env.SERPAPI_API_KEY === 'string' ? env.SERPAPI_API_KEY.trim() || null : null
  return analyzeArgentinaMarketHybrid(productName, category, {
    mercadoLibreAccessToken: auth.accessToken,
    googleShoppingApiKey,
  })
}

function validRefreshKey(raw: string | null) {
  if (!raw) return null
  const value = raw.trim()
  return value.length >= 8 && value.length <= 120 ? value : null
}

export function isWatchlistRoute(pathname: string) {
  return pathname === '/api/watchlist'
    || pathname === '/api/watchlist-item'
    || pathname === '/api/watchlist-refresh'
}

export async function handleWatchlist(request: Request, env: Env, dependencies: WatchlistDependencies = {}): Promise<Response> {
  const url = new URL(request.url)
  const userId = readTrustedUserId(request)
  if (!userId) return json({ error: 'Unauthorized.', code: 'unauthorized' }, 401)
  if (!env.DB) return json({ error: 'Watchlist storage is not configured.', code: 'watchlist_store_unavailable' }, 503)

  const clock = dependencies.clock ?? (() => new Date())
  const repo = new WatchlistRepository(env.DB, clock)
  const history = new AnalysisHistoryRepository(env.DB, clock)
  const marketLookup = dependencies.marketLookup ?? defaultMarketLookup

  if (url.pathname === '/api/watchlist' && request.method === 'POST') {
    let body: any
    try { body = await request.json() } catch {
      return json({ error: 'Invalid JSON body.', code: 'invalid_json' }, 400)
    }
    if (!body || typeof body !== 'object' || typeof body.analysisId !== 'string') {
      return json({ error: 'analysisId is required.', code: 'invalid_watchlist_payload' }, 400)
    }

    let analysisRow: AnalysisHistoryRow | null
    try { analysisRow = await history.getVisibleForUser(userId, body.analysisId) } catch { return notFound() }
    if (!analysisRow) return notFound()

    try {
      const basis = basisFromAnalysis(analysisRow)
      const item = await repo.addOrReactivateFromAnalysis({
        id: crypto.randomUUID(),
        userId,
        analysisId: analysisRow.id,
        title: basis.productName,
        sourceUrl: basis.sourceUrl,
        metadata: basis,
      })
      const observedAt = clock().toISOString()
      const market = marketFromAnalysis(analysisRow)
      const landed = landedCostArs(basis)
      await repo.addSnapshotForUser({
        id: crypto.randomUUID(),
        userId,
        watchlistItemId: item.id,
        observedAt,
        marketPriceArs: market.marketPriceArs,
        landedCostArs: landed,
        payload: initialSnapshotPayload(analysisRow, basis, observedAt),
        idempotencyKey: `initial:${item.id}:${analysisRow.id}`,
      })
      return json({ item: await itemView(repo, item, userId, 2) }, 201)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (/must be|exceeds|serializable|non-negative|valid UTC/i.test(message)) {
        return json({ error: 'Watchlist data is invalid.', code: 'invalid_watchlist_payload' }, 400)
      }
      if (/idempotency collision/i.test(message)) {
        return json({ error: 'Watchlist retry collided with different snapshot content.', code: 'idempotency_collision' }, 409)
      }
      throw error
    }
  }

  if (url.pathname === '/api/watchlist' && request.method === 'GET') {
    const rows = await repo.listActiveForUser(userId)
    const items = []
    for (const row of rows) items.push(await itemView(repo, row, userId, 2))
    return json({ items })
  }

  if (url.pathname === '/api/watchlist-item' && request.method === 'GET') {
    const id = url.searchParams.get('id')
    if (!id) return notFound()
    let row: WatchlistItemRow | null
    try { row = await repo.getActiveForUser(userId, id) } catch { return notFound() }
    if (!row) return notFound()
    return json({ item: await itemView(repo, row, userId, 50) })
  }

  if (url.pathname === '/api/watchlist-item' && request.method === 'DELETE') {
    const id = url.searchParams.get('id')
    if (!id) return notFound()
    let changed = 0
    try { changed = await repo.deactivateForUser(userId, id) } catch { return notFound() }
    return changed === 1 ? new Response(null, { status: 204 }) : notFound()
  }

  if (url.pathname === '/api/watchlist-refresh' && request.method === 'POST') {
    const id = url.searchParams.get('id')
    if (!id) return notFound()
    const refreshKey = validRefreshKey(request.headers.get('idempotency-key'))
    if (!refreshKey) return json({ error: 'A valid Idempotency-Key header is required.', code: 'invalid_idempotency_key' }, 400)

    let item: WatchlistItemRow | null
    try { item = await repo.getActiveForUser(userId, id) } catch { return notFound() }
    if (!item) return notFound()
    const basis = parseWatchlistMetadata(item) as WatchlistBasis | null
    if (!basis || basis.schemaVersion !== 1 || !basis.productName) {
      return json({ error: 'This watchlist item has no trusted snapshot basis.', code: 'watchlist_basis_unavailable' }, 409)
    }

    const observedAt = clock().toISOString()
    let market: ArgentinaMarketResult | null = null
    let providerError: string | undefined
    try {
      market = await marketLookup(basis.productName, basis.category, env)
    } catch (error) {
      providerError = error instanceof Error ? error.message.slice(0, 240) : 'Market provider unavailable.'
    }

    const marketPriceArs = market?.status === 'live' ? positiveNumber(market.suggestedPriceArs) : null
    const landed = landedCostArs(basis)
    try {
      await repo.addSnapshotForUser({
        id: crypto.randomUUID(),
        userId,
        watchlistItemId: item.id,
        observedAt,
        marketPriceArs,
        landedCostArs: landed,
        payload: refreshSnapshotPayload(market, basis, observedAt, providerError),
        idempotencyKey: `refresh:${item.id}:${refreshKey}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (/idempotency collision/i.test(message)) {
        return json({ error: 'Idempotency key was already used for different refresh content.', code: 'idempotency_collision' }, 409)
      }
      throw error
    }

    const refreshed = await repo.getActiveForUser(userId, item.id)
    if (!refreshed) return notFound()
    return json({ item: await itemView(repo, refreshed, userId, 50) }, 201)
  }

  return json({ error: 'Method not allowed.', code: 'method_not_allowed' }, 405)
}
