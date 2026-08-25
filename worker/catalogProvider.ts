import { buildMarketQuery, cleanText, comparableScore } from './catalogMatch'
import { percentile, trimPriceOutliers } from './catalogStats'
import type { ArgentinaMarketResult, MarketComparable, MlDomainPrediction, MlSalePrice, MlSearch } from './marketTypes'

type MercadoLibreMarketOptions = {
  accessToken?: string | null
  fetchImpl?: typeof fetch
  salePriceLookupLimit?: number
}

const API_ROOT = 'https://api.mercadolibre.com'

type MlCallMode = 'authenticated' | 'public'

class MercadoLibreApiError extends Error {
  status: number
  path: string
  mode: MlCallMode

  constructor(status: number, path: string, mode: MlCallMode) {
    const authHint = status === 401 || status === 403 ? ' · revisar token/permisos' : ''
    super(`Mercado Libre API ${status}${authHint}`)
    this.status = status
    this.path = path
    this.mode = mode
  }
}

function emptyResult(
  status: ArgentinaMarketResult['status'],
  query: string,
  warnings: string[],
  source = 'Mercado Libre Argentina API',
): ArgentinaMarketResult {
  return {
    status,
    query,
    categoryId: null,
    categoryName: null,
    rawCount: 0,
    comparableCount: 0,
    effectivePriceCount: 0,
    p25Ars: null,
    medianArs: null,
    p75Ars: null,
    suggestedPriceArs: null,
    confidence: 0,
    source,
    priceQuality: 'listed_search_price',
    comparables: [],
    warnings,
  }
}

function requestHeaders(accessToken?: string | null) {
  return {
    accept: 'application/json',
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    'user-agent': 'ShippingAPP/1.8',
  }
}

function isAuthRejected(error: unknown) {
  return error instanceof MercadoLibreApiError && (error.status === 401 || error.status === 403)
}

async function mercadoLibreGet<T>(
  fetchImpl: typeof fetch,
  path: string,
  accessToken?: string | null,
  mode: MlCallMode = accessToken ? 'authenticated' : 'public',
): Promise<T> {
  const response = await fetchImpl(`${API_ROOT}${path}`, { headers: requestHeaders(accessToken) })
  if (!response.ok) throw new MercadoLibreApiError(response.status, path, mode)
  return response.json() as Promise<T>
}

async function mercadoLibreSearchGet<T>(
  fetchImpl: typeof fetch,
  path: string,
  accessToken: string,
  warnings: string[],
  label: string,
): Promise<{ data: T; mode: 'authenticated' | 'public_fallback' }> {
  try {
    return { data: await mercadoLibreGet<T>(fetchImpl, path, accessToken, 'authenticated'), mode: 'authenticated' }
  } catch (error) {
    if (!isAuthRejected(error)) throw error
    warnings.push(`${label}: Mercado Libre rechazó Bearer ${error instanceof MercadoLibreApiError ? error.status : ''}; se reintenta la búsqueda pública sin exponer ni reutilizar el token.`)
    return { data: await mercadoLibreGet<T>(fetchImpl, path, null, 'public'), mode: 'public_fallback' }
  }
}

async function predictCategory(
  fetchImpl: typeof fetch,
  query: string,
  accessToken: string,
  warnings: string[],
): Promise<{ prediction: MlDomainPrediction | null; mode: 'authenticated' | 'public_fallback' | 'unavailable' }> {
  const path = `/sites/MLA/domain_discovery/search?limit=1&q=${encodeURIComponent(query)}`
  try {
    const result = await mercadoLibreSearchGet<MlDomainPrediction[]>(fetchImpl, path, accessToken, warnings, 'Category predictor')
    const predictions = Array.isArray(result.data) ? result.data : []
    return { prediction: predictions[0] || null, mode: result.mode }
  } catch (error) {
    warnings.push(`Category predictor unavailable: ${error instanceof Error ? error.message : 'unknown error'}. Search continues without category confinement.`)
    return { prediction: null, mode: 'unavailable' }
  }
}

async function effectiveSalePrice(
  fetchImpl: typeof fetch,
  item: MarketComparable,
  accessToken: string,
): Promise<MarketComparable> {
  if (!item.id) return item
  try {
    const price = await mercadoLibreGet<MlSalePrice>(
      fetchImpl,
      `/items/${encodeURIComponent(item.id)}/sale_price?context=channel_marketplace`,
      accessToken,
      'authenticated',
    )
    if (price.currency_id === 'ARS' && typeof price.amount === 'number' && Number.isFinite(price.amount) && price.amount > 0) {
      return { ...item, priceArs: price.amount, priceSource: 'sale_price' }
    }
  } catch {
    // Search price remains a traceable fallback for this individual comparable.
  }
  return item
}

export async function analyzeArgentinaMarket(
  productName: string,
  category: string,
  options: MercadoLibreMarketOptions = {},
): Promise<ArgentinaMarketResult> {
  const query = buildMarketQuery(productName, category)
  const accessToken = options.accessToken?.trim()
  const fetchImpl = options.fetchImpl || fetch
  const warnings = [
    'Demand is not inferred from public available quantity.',
    'Search prices are used only as per-listing fallback when effective sale_price cannot be resolved.',
  ]

  if (!accessToken) {
    return emptyResult(
      'configuration_required',
      query,
      [...warnings, 'Mercado Libre authentication is not configured. Set MERCADOLIBRE_ACCESS_TOKEN as a Worker secret; no unauthenticated market price is promoted into economics.'],
      'Mercado Libre Argentina API · authentication required',
    )
  }

  try {
    const predictionResult = await predictCategory(fetchImpl, query, accessToken, warnings)
    const prediction = predictionResult.prediction

    const params = new URLSearchParams({ q: query, limit: '50' })
    if (prediction?.category_id) params.set('category', prediction.category_id)
    const searchResult = await mercadoLibreSearchGet<MlSearch>(fetchImpl, `/sites/MLA/search?${params.toString()}`, accessToken, warnings, 'Search')
    const data = searchResult.data
    const marketSearchMode = searchResult.mode === 'public_fallback' || predictionResult.mode === 'public_fallback'
      ? 'public search fallback after token validation'
      : 'authenticated search'

    const raw = Array.isArray(data.results) ? data.results : []
    const seen = new Set<string>()
    const matches: MarketComparable[] = []

    for (const item of raw) {
      const score = comparableScore(item, productName, category, {
        categoryId: prediction?.category_id,
        inferredAttributes: prediction?.attributes,
      })
      if (score < 55 || !item.price || item.currency_id !== 'ARS') continue
      const key = item.catalog_product_id || `${cleanText(item.title || '')}:${item.seller?.id || 'x'}`
      if (seen.has(key)) continue
      seen.add(key)
      matches.push({
        id: item.id || '',
        title: item.title || '',
        priceArs: item.price,
        listedPriceArs: item.price,
        priceSource: 'search_price',
        score,
        reason: score >= 65 ? 'strong comparable' : 'fallback comparable',
        permalink: item.permalink,
        categoryId: item.category_id,
        catalogProductId: item.catalog_product_id,
      })
    }

    const strict = matches.filter((item) => item.score >= 65)
    const acceptedBeforePrice = strict.length >= 5 ? strict : matches
    const lookupLimit = Math.max(0, Math.min(30, options.salePriceLookupLimit ?? 24))
    const pricedHead = await Promise.all(
      acceptedBeforePrice.slice(0, lookupLimit).map((item) => effectiveSalePrice(fetchImpl, item, accessToken)),
    )
    const priced = [...pricedHead, ...acceptedBeforePrice.slice(lookupLimit)]
    const accepted = trimPriceOutliers(priced, (item) => item.priceArs, 5)
    const prices = accepted.map((item) => item.priceArs)
    const p25Ars = percentile(prices, 0.25)
    const medianArs = percentile(prices, 0.5)
    const p75Ars = percentile(prices, 0.75)
    const suggestedPriceArs = percentile(prices, 0.4)
    const effectivePriceCount = accepted.filter((item) => item.priceSource === 'sale_price').length
    const effectiveCoverage = accepted.length ? effectivePriceCount / accepted.length : 0
    const strictShare = acceptedBeforePrice.length ? strict.length / acceptedBeforePrice.length : 0
    const confidence = Math.min(95, Math.round(
      Math.min(50, (accepted.length / 12) * 50)
      + strictShare * 20
      + (prediction?.category_id ? 10 : 0)
      + effectiveCoverage * 15,
    ))

    if (accepted.length < priced.length) warnings.push(`${priced.length - accepted.length} price outlier(s) excluded by IQR screening.`)
    const fallbackPrices = accepted.length - effectivePriceCount
    if (fallbackPrices > 0) warnings.push(`${fallbackPrices} comparable(s) use authenticated search price because sale_price was unavailable.`)
    if (prediction?.category_id) warnings.push(`Search confined to predicted Mercado Libre category ${prediction.category_id}${prediction.category_name ? ` (${prediction.category_name})` : ''}.`)
    if (marketSearchMode.includes('public')) warnings.push('MercadoLibre token was validated through /users/me, but listing search used the public search endpoint after Bearer was rejected for that endpoint.')

    const priceQuality: ArgentinaMarketResult['priceQuality'] = effectivePriceCount === accepted.length && accepted.length > 0
      ? 'effective_sale_price'
      : effectivePriceCount > 0
        ? 'mixed_sale_and_search_price'
        : 'listed_search_price'

    return {
      status: accepted.length >= 5 && medianArs ? 'live' : 'insufficient',
      query,
      categoryId: prediction?.category_id || null,
      categoryName: prediction?.category_name || null,
      rawCount: raw.length,
      comparableCount: accepted.length,
      effectivePriceCount,
      p25Ars,
      medianArs,
      p75Ars,
      suggestedPriceArs,
      confidence,
      source: `Mercado Libre Argentina API · ${marketSearchMode}${prediction?.category_id ? ' category search' : ' search'}${effectivePriceCount ? ' + effective sale_price' : ''}`,
      priceQuality,
      comparables: accepted.sort((a, b) => b.score - a.score).slice(0, 8),
      warnings,
    }
  } catch (error) {
    return emptyResult(
      'unavailable',
      query,
      [...warnings, error instanceof Error ? error.message : 'Mercado Libre market unavailable'],
      'Mercado Libre Argentina API · authenticated',
    )
  }
}