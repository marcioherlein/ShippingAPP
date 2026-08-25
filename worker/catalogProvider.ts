import { buildMarketQuery, cleanText, comparableScore } from './catalogMatch'
import { percentile, trimPriceOutliers } from './catalogStats'
import type { ArgentinaMarketResult, MarketComparable, MlDomainPrediction, MlSalePrice, MlSearch } from './marketTypes'

type MercadoLibreMarketOptions = {
  accessToken?: string | null
  fetchImpl?: typeof fetch
  salePriceLookupLimit?: number
}

type CatalogProduct = {
  id?: string
  name?: string
  title?: string
  status?: string
  domain_id?: string
  permalink?: string
  buy_box_winner?: Record<string, unknown> | null
  buy_box_winner_price_range?: unknown
  [key: string]: unknown
}

type CatalogProductSearch = {
  keywords?: string
  domain_id?: string
  paging?: { total?: number; offset?: number; limit?: number }
  results?: CatalogProduct[]
}

const API_ROOT = 'https://api.mercadolibre.com'

type MlCallMode = 'authenticated' | 'public'

type MarketSearchData = {
  data: MlSearch
  prediction: MlDomainPrediction | null
  searchMode: string
  sourceSuffix: string
}

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

function isForbiddenError(error: unknown) {
  return error instanceof MercadoLibreApiError && error.status === 403
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
    warnings.push(`${label}: MercadoLibre rechazó la llamada autenticada; se reintenta sin Bearer para separar problema de token vs. endpoint.`)
    try {
      return { data: await mercadoLibreGet<T>(fetchImpl, path, null, 'public'), mode: 'public_fallback' }
    } catch (publicError) {
      if (isAuthRejected(publicError)) warnings.push(`${label}: el endpoint de búsqueda también fue bloqueado en modo público; se pasa a fallback de catálogo cuando aplique.`)
      throw publicError
    }
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
    warnings.push(`Category predictor unavailable: ${error instanceof Error ? error.message.replace('Mercado Libre API 403 · revisar token/permisos', 'MercadoLibre category predictor blocked by API policy') : 'unknown error'}. Search continues without category confinement.`)
    return { prediction: null, mode: 'unavailable' }
  }
}

function numericPrice(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.,]/g, '').replace(',', '.'))
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

function catalogProductPrice(product: CatalogProduct): number | null {
  const candidates: unknown[] = [
    product.price,
    product.amount,
    product.buy_box_winner && (product.buy_box_winner as any).price,
    product.buy_box_winner && (product.buy_box_winner as any).amount,
    product.buy_box_winner && (product.buy_box_winner as any).sale_price,
  ]

  const range = product.buy_box_winner_price_range as any
  if (range && typeof range === 'object') {
    candidates.push(
      range.min?.price, range.min?.amount, range.min?.value,
      range.minimum?.price, range.minimum?.amount, range.minimum?.value,
      range.max?.price, range.max?.amount, range.max?.value,
      range.maximum?.price, range.maximum?.amount, range.maximum?.value,
      range.price, range.amount, range.value,
    )
  }

  for (const candidate of candidates) {
    const price = numericPrice(candidate)
    if (price) return price
  }
  return null
}

function catalogProductsToSearch(data: CatalogProductSearch, productName: string, category: string): MlSearch {
  const results = Array.isArray(data.results) ? data.results : []
  return {
    paging: { total: data.paging?.total ?? results.length },
    results: results.flatMap((product) => {
      const title = product.name || product.title || product.id || ''
      const price = catalogProductPrice(product)
      if (!title || !price) return []
      return [{
        id: product.buy_box_winner && typeof (product.buy_box_winner as any).item_id === 'string'
          ? (product.buy_box_winner as any).item_id
          : product.id,
        title,
        price,
        currency_id: 'ARS',
        condition: 'new',
        category_id: product.domain_id,
        catalog_product_id: product.id,
        permalink: product.permalink,
        seller: product.buy_box_winner && typeof (product.buy_box_winner as any).seller_id === 'number'
          ? { id: (product.buy_box_winner as any).seller_id }
          : undefined,
        attributes: Array.isArray(product.attributes) ? product.attributes : [],
      }]
    }).filter((item) => comparableScore(item as any, productName, category, {}) >= 45),
  }
}

async function catalogSearchFallback(
  fetchImpl: typeof fetch,
  query: string,
  productName: string,
  category: string,
  accessToken: string,
  warnings: string[],
): Promise<MarketSearchData> {
  const path = `/products/search?status=active&site_id=MLA&limit=20&q=${encodeURIComponent(query)}`
  try {
    const catalog = await mercadoLibreGet<CatalogProductSearch>(fetchImpl, path, accessToken, 'authenticated')
    warnings.push('MercadoLibre listing search endpoint was blocked for this app; ShippingAPP used the official catalog products fallback instead.')
    return {
      data: catalogProductsToSearch(catalog, productName, category),
      prediction: null,
      searchMode: 'catalog products fallback after listing search block',
      sourceSuffix: 'catalog products fallback',
    }
  } catch (error) {
    if (isForbiddenError(error)) {
      warnings.push('MercadoLibre validated the token through /users/me, but listing search and catalog search are blocked for this app. No market benchmark is promoted into economics.')
      return {
        data: { paging: { total: 0 }, results: [] },
        prediction: null,
        searchMode: 'api search blocked after token validation',
        sourceSuffix: 'search blocked',
      }
    }
    throw error
  }
}

async function marketSearch(
  fetchImpl: typeof fetch,
  query: string,
  productName: string,
  category: string,
  accessToken: string,
  warnings: string[],
): Promise<MarketSearchData> {
  const predictionResult = await predictCategory(fetchImpl, query, accessToken, warnings)
  const prediction = predictionResult.prediction
  const params = new URLSearchParams({ q: query, limit: '50' })
  if (prediction?.category_id) params.set('category', prediction.category_id)

  try {
    const searchResult = await mercadoLibreSearchGet<MlSearch>(fetchImpl, `/sites/MLA/search?${params.toString()}`, accessToken, warnings, 'Search')
    const searchMode = searchResult.mode === 'public_fallback' || predictionResult.mode === 'public_fallback'
      ? 'public listing search fallback after token validation'
      : 'authenticated listing search'
    return { data: searchResult.data, prediction, searchMode, sourceSuffix: prediction?.category_id ? 'category search' : 'search' }
  } catch (error) {
    if (isAuthRejected(error)) return catalogSearchFallback(fetchImpl, query, productName, category, accessToken, warnings)
    throw error
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
    const search = await marketSearch(fetchImpl, query, productName, category, accessToken, warnings)
    const data = search.data
    const prediction = search.prediction
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
        reason: score >= 65 ? 'strong comparable' : search.sourceSuffix.includes('catalog') ? 'catalog fallback comparable' : 'fallback comparable',
        permalink: item.permalink,
        categoryId: item.category_id,
        catalogProductId: item.catalog_product_id,
      })
    }

    const strict = matches.filter((item) => item.score >= 65)
    const acceptedBeforePrice = strict.length >= 5 ? strict : matches
    const lookupLimit = search.sourceSuffix.includes('catalog') ? 0 : Math.max(0, Math.min(30, options.salePriceLookupLimit ?? 24))
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
    if (fallbackPrices > 0) warnings.push(`${fallbackPrices} comparable(s) use search/listed price because effective sale_price was unavailable.`)
    if (prediction?.category_id) warnings.push(`Search confined to predicted Mercado Libre category ${prediction.category_id}${prediction.category_name ? ` (${prediction.category_name})` : ''}.`)
    if (search.searchMode.includes('public')) warnings.push('MercadoLibre token was validated through /users/me, but listing search used a public retry after Bearer was rejected for that endpoint.')
    if (!accepted.length && search.searchMode.includes('blocked')) warnings.push('MercadoLibre search access is blocked for this app; ShippingAPP keeps the market section as insufficient instead of promoting a fake benchmark.')

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
      source: `Mercado Libre Argentina API · ${search.searchMode}${search.sourceSuffix ? ` · ${search.sourceSuffix}` : ''}${effectivePriceCount ? ' + effective sale_price' : ''}`,
      priceQuality,
      comparables: accepted.sort((a, b) => b.score - a.score).slice(0, 8),
      warnings,
    }
  } catch (error) {
    if (isAuthRejected(error)) {
      return emptyResult(
        'insufficient',
        query,
        [...warnings, 'MercadoLibre validated the token through /users/me, but this app is not allowed to use listing search for market benchmarks yet. No fallback benchmark is fabricated.'],
        'Mercado Libre Argentina API · search access blocked after token validation',
      )
    }
    return emptyResult(
      'unavailable',
      query,
      [...warnings, error instanceof Error ? error.message : 'Mercado Libre market unavailable'],
      'Mercado Libre Argentina API · authenticated',
    )
  }
}
