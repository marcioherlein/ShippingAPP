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
// Per-request ceiling so a single slow/hung Mercado Libre call cannot exhaust the Worker.
const ML_REQUEST_TIMEOUT_MS = 6000
const CATALOG_HYDRATION_LIMIT = 12

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
  // Bound every Mercado Libre call: a hung upstream must not consume Worker wall-clock.
  // A timeout surfaces as a thrown error, which callers already treat as provider-unavailable
  // (fail-closed), never as a fabricated price.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ML_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetchImpl(`${API_ROOT}${path}`, { headers: requestHeaders(accessToken), signal: controller.signal })
    if (!response.ok) throw new MercadoLibreApiError(response.status, path, mode)
    return await response.json() as T
  } finally {
    clearTimeout(timer)
  }
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

function catalogWinner(product: CatalogProduct): Record<string, unknown> | null {
  return product.buy_box_winner && typeof product.buy_box_winner === 'object'
    ? product.buy_box_winner
    : null
}

function catalogWinnerItemId(product: CatalogProduct): string | null {
  const value = catalogWinner(product)?.item_id
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^MLA\d{6,}$/.test(trimmed) ? trimmed : null
}

function catalogWinnerCurrency(product: CatalogProduct): string | null {
  const value = catalogWinner(product)?.currency_id
  return typeof value === 'string' ? value.trim().toUpperCase() : null
}

function catalogProductPrice(product: CatalogProduct): number | null {
  const winner = catalogWinner(product)
  const candidates: unknown[] = [
    winner?.price,
    winner?.amount,
    winner?.sale_price,
    product.price,
    product.amount,
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

function catalogProductIsBuyable(product: CatalogProduct) {
  return Boolean(
    catalogWinnerItemId(product)
    && catalogWinnerCurrency(product) === 'ARS'
    && catalogProductPrice(product),
  )
}

async function hydrateCatalogProducts(
  fetchImpl: typeof fetch,
  products: CatalogProduct[],
  accessToken: string,
  warnings: string[],
): Promise<CatalogProduct[]> {
  const selected = products
    .filter((product) => typeof product?.id === 'string' && product.id.trim())
    .slice(0, CATALOG_HYDRATION_LIMIT)

  let fetchedDetails = 0
  const settled = await Promise.allSettled(selected.map(async (product) => {
    if (catalogProductIsBuyable(product)) return product
    fetchedDetails += 1
    const id = String(product.id).trim()
    const detail = await mercadoLibreGet<CatalogProduct>(
      fetchImpl,
      `/products/${encodeURIComponent(id)}`,
      accessToken,
      'authenticated',
    )
    return {
      ...product,
      ...detail,
      id: detail.id || product.id,
      name: detail.name || product.name,
      title: detail.title || product.title,
      domain_id: detail.domain_id || product.domain_id,
      permalink: detail.permalink || product.permalink,
      attributes: Array.isArray(detail.attributes) ? detail.attributes : product.attributes,
    }
  }))

  const hydrated: CatalogProduct[] = []
  let failures = 0
  for (const result of settled) {
    if (result.status === 'fulfilled') hydrated.push(result.value)
    else failures += 1
  }

  const buyable = hydrated.filter(catalogProductIsBuyable).length
  warnings.push(`MercadoLibre catalog fallback inspected ${selected.length} catalog product(s); ${buyable} exposed a buy-box item with an ARS price${fetchedDetails ? ` after ${fetchedDetails} product-detail request(s)` : ''}.`)
  if (failures) warnings.push(`${failures} MercadoLibre catalog product-detail request(s) failed and were skipped.`)
  if (products.length > selected.length) warnings.push(`Catalog hydration was bounded to ${CATALOG_HYDRATION_LIMIT} products to cap provider fan-out.`)

  return hydrated
}

function catalogProductsToSearch(data: CatalogProductSearch, productName: string, category: string): MlSearch {
  const results = Array.isArray(data.results) ? data.results : []
  return {
    paging: { total: data.paging?.total ?? results.length },
    results: results.flatMap((product) => {
      const title = product.name || product.title || product.id || ''
      const itemId = catalogWinnerItemId(product)
      const price = catalogProductPrice(product)
      const currency = catalogWinnerCurrency(product)
      if (!title || !itemId || !price || currency !== 'ARS') return []
      const winner = catalogWinner(product)
      return [{
        id: itemId,
        title,
        price,
        currency_id: 'ARS',
        condition: 'new',
        category_id: typeof winner?.category_id === 'string' ? winner.category_id : product.domain_id,
        catalog_product_id: product.id,
        permalink: product.permalink,
        seller: typeof winner?.seller_id === 'number' ? { id: winner.seller_id } : undefined,
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
    const rawProducts = Array.isArray(catalog.results) ? catalog.results : []
    const hydratedProducts = await hydrateCatalogProducts(fetchImpl, rawProducts, accessToken, warnings)
    warnings.push('MercadoLibre listing search endpoint was blocked for this app; ShippingAPP used official catalog discovery plus product-detail buy-box hydration instead.')
    return {
      data: catalogProductsToSearch({ ...catalog, results: hydratedProducts }, productName, category),
      prediction: null,
      searchMode: 'catalog product-detail fallback after listing search block',
      sourceSuffix: 'catalog buy-box hydration fallback',
    }
  } catch (error) {
    if (isForbiddenError(error)) {
      warnings.push('MercadoLibre validated the token through /users/me, but listing search and catalog discovery are blocked for this app. No market benchmark is promoted into economics.')
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
      salePriceLookupAllowed = !search.searchMode.includes('api search blocked')
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
