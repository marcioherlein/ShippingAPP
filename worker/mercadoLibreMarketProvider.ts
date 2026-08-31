import { comparableScore } from './catalogMatch'
import type {
  ArgentinaMarketCandidate,
  ArgentinaMarketDiscoveryProvider,
  ArgentinaMarketPriceResolver,
} from './marketProviderContracts'
import type { MlDomainPrediction, MlResult, MlSalePrice, MlSearch } from './marketTypes'

export type MercadoLibreMarketProviderOptions = {
  accessToken: string
  fetchImpl?: typeof fetch
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

type MlCallMode = 'authenticated' | 'public'

type MarketSearchData = {
  data: MlSearch
  prediction: MlDomainPrediction | null
  searchMode: string
  sourceSuffix: string
}

const API_ROOT = 'https://api.mercadolibre.com'

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

function requestHeaders(accessToken?: string | null) {
  return {
    accept: 'application/json',
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    'user-agent': 'ShippingAPP/1.9',
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
      ? 'public search fallback after token validation'
      : 'authenticated listing search'
    return { data: searchResult.data, prediction, searchMode, sourceSuffix: prediction?.category_id ? 'category search' : 'search' }
  } catch (error) {
    if (isAuthRejected(error)) return catalogSearchFallback(fetchImpl, query, productName, category, accessToken, warnings)
    throw error
  }
}

function marketCandidate(item: MlResult): ArgentinaMarketCandidate | null {
  if (!item.id || !item.title || !item.price || item.currency_id !== 'ARS') return null
  return {
    id: item.id,
    title: item.title,
    priceArs: item.price,
    condition: item.condition,
    categoryId: item.category_id,
    catalogProductId: item.catalog_product_id,
    sellerKey: item.seller?.id ? String(item.seller.id) : undefined,
    permalink: item.permalink,
    attributes: item.attributes,
  }
}

export function createMercadoLibreMarketProviders(options: MercadoLibreMarketProviderOptions) {
  const accessToken = options.accessToken.trim()
  const fetchImpl = options.fetchImpl || fetch
  let salePriceLookupAllowed = true

  const discoveryProvider: ArgentinaMarketDiscoveryProvider = {
    id: 'mercadolibre-argentina',
    async discover(context) {
      const warnings: string[] = []
      const search = await marketSearch(
        fetchImpl,
        context.query,
        context.productName,
        context.category,
        accessToken,
        warnings,
      )
      salePriceLookupAllowed = !search.sourceSuffix.includes('catalog') && !search.searchMode.includes('blocked')
      const raw = Array.isArray(search.data.results) ? search.data.results : []
      const candidates = raw.flatMap((item) => {
        const candidate = marketCandidate(item)
        return candidate ? [candidate] : []
      })

      if (search.prediction?.category_id) {
        warnings.push(`Search confined to predicted Mercado Libre category ${search.prediction.category_id}${search.prediction.category_name ? ` (${search.prediction.category_name})` : ''}.`)
      }
      if (search.searchMode.includes('public')) {
        warnings.push('MercadoLibre token was validated through /users/me, but listing search used a public retry after Bearer was rejected for that endpoint.')
      }
      if (!candidates.length && search.searchMode.includes('blocked')) {
        warnings.push('MercadoLibre search access is blocked for this app; ShippingAPP keeps the market section as insufficient instead of promoting a fake benchmark.')
      }

      return {
        providerId: 'mercadolibre-argentina',
        sourceLabel: `Mercado Libre Argentina API · ${search.searchMode}${search.sourceSuffix ? ` · ${search.sourceSuffix}` : ''}`,
        candidates,
        categoryHint: search.prediction ? {
          categoryId: search.prediction.category_id || null,
          categoryName: search.prediction.category_name || null,
          attributes: search.prediction.attributes,
        } : null,
        warnings,
      }
    },
  }

  const priceResolver: ArgentinaMarketPriceResolver = {
    id: 'effective sale_price',
    async resolve(candidate) {
      if (!salePriceLookupAllowed || !candidate.id) return null
      try {
        const price = await mercadoLibreGet<MlSalePrice>(
          fetchImpl,
          `/items/${encodeURIComponent(candidate.id)}/sale_price?context=channel_marketplace`,
          accessToken,
          'authenticated',
        )
        if (price.currency_id !== 'ARS' || typeof price.amount !== 'number' || !Number.isFinite(price.amount) || price.amount <= 0) return null
        return {
          priceArs: price.amount,
          effective: true,
          sourceLabel: 'Mercado Libre effective sale_price',
        }
      } catch {
        return null
      }
    },
  }

  return { discoveryProvider, priceResolver }
}
