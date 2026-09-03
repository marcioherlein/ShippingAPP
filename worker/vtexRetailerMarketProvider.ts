import type { ArgentinaMarketCandidate, ArgentinaMarketDiscoveryProvider } from './marketProviderContracts'
import type { MlAttribute } from './marketTypes'
import { discoverFravegaLanding } from './fravegaLandingMarketProvider'

export type ArgentinaVtexRetailer = {
  id: string
  name: string
  baseUrl: string
  tradePolicy?: string
  maxCandidates?: number
}

export type VtexRetailerMarketProviderOptions = {
  fetchImpl?: typeof fetch
  retailers?: ArgentinaVtexRetailer[]
  requestTimeoutMs?: number
}

type VtexCommercialOffer = {
  Price?: number
  ListPrice?: number
  AvailableQuantity?: number
}

type VtexSeller = {
  sellerId?: string
  sellerName?: string
  commertialOffer?: VtexCommercialOffer
  commercialOffer?: VtexCommercialOffer
}

type VtexItem = {
  itemId?: string
  name?: string
  nameComplete?: string
  sellers?: VtexSeller[]
}

type VtexProperty = {
  name?: string
  values?: string[]
}

type VtexSpecification = {
  name?: string
  values?: string[]
}

type VtexSpecificationGroup = {
  specifications?: VtexSpecification[]
}

type VtexProduct = {
  productId?: string
  productName?: string
  brand?: string
  link?: string
  linkText?: string
  productReference?: string
  items?: VtexItem[]
  properties?: VtexProperty[]
  specificationGroups?: VtexSpecificationGroup[]
}

type RetailerDiscovery = {
  retailer: ArgentinaVtexRetailer
  mode: 'intelligent-search' | 'legacy-search' | 'structured-landing' | 'unavailable'
  candidates: ArgentinaMarketCandidate[]
  warnings: string[]
}

export const DEFAULT_ARGENTINA_VTEX_RETAILERS: readonly ArgentinaVtexRetailer[] = [
  { id: 'fravega', name: 'Frávega', baseUrl: 'https://www.fravega.com', tradePolicy: '1', maxCandidates: 12 },
  { id: 'cetrogar', name: 'Cetrogar', baseUrl: 'https://www.cetrogar.com.ar', tradePolicy: '1', maxCandidates: 12 },
  { id: 'naldo', name: 'Naldo', baseUrl: 'https://www.naldo.com.ar', tradePolicy: '1', maxCandidates: 12 },
  { id: 'oncity', name: 'OnCity', baseUrl: 'https://www.oncity.com', tradePolicy: '1', maxCandidates: 12 },
  { id: 'pardo', name: 'Pardo', baseUrl: 'https://www.pardo.com.ar', tradePolicy: '1', maxCandidates: 12 },
  { id: 'easy', name: 'Easy', baseUrl: 'https://www.easy.com.ar', tradePolicy: '1', maxCandidates: 12 },
  { id: 'coppel', name: 'Coppel', baseUrl: 'https://www.coppel.com.ar', tradePolicy: '1', maxCandidates: 12 },
  { id: 'carrefour', name: 'Carrefour', baseUrl: 'https://www.carrefour.com.ar', tradePolicy: '1', maxCandidates: 12 },
  { id: 'sportline', name: 'Sportline', baseUrl: 'https://www.sportline.com.ar', tradePolicy: '1', maxCandidates: 12 },
]

// Specialized official-brand storefronts are kept separate from the generalist
// registry so their marginal value can be measured independently. They still
// participate in the same parallel public-VTEX discovery and every candidate
// is gated by the same deterministic matcher before economics.
export const SPECIALIZED_ARGENTINA_VTEX_RETAILERS: readonly ArgentinaVtexRetailer[] = [
  { id: 'sony-official', name: 'Sony Store Oficial', baseUrl: 'https://store.sony.com.ar', tradePolicy: '1', maxCandidates: 12 },
]

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function offerOf(seller: VtexSeller) {
  return seller.commertialOffer || seller.commercialOffer || null
}

function productsOf(value: unknown): VtexProduct[] {
  if (Array.isArray(value)) return value as VtexProduct[]
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  if (Array.isArray(record.products)) return record.products as VtexProduct[]
  if (record.productSearch && typeof record.productSearch === 'object') {
    const nested = record.productSearch as Record<string, unknown>
    if (Array.isArray(nested.products)) return nested.products as VtexProduct[]
  }
  if (record.data && typeof record.data === 'object') {
    const nested = record.data as Record<string, unknown>
    if (Array.isArray(nested.products)) return nested.products as VtexProduct[]
  }
  return []
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

/**
 * Sony's VTEX catalog currently exposes headphone model identity in both
 * canonical hyphenated form (WH-1000XM5) and compact SKU form
 * (WH1000XM5/LMUC). The exact matcher intentionally treats distinct model
 * codes as hard conflicts, so normalize only Sony's well-known WH/WF compact
 * headphone prefixes before matching. The prefix is preserved, which keeps
 * WH1000XM5 and WF1000XM5 distinct.
 */
export function normalizeSonyOfficialIdentityText(value: string) {
  return text(value).replace(/\b(WH|WF)(\d{3,4}XM\d)\b/gi, '$1-$2')
}

// Lowercased, de-accented, alphanumeric-tokenized text for coarse query↔title relevance.
function normalizeForRelevance(value: string) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function attributesOf(product: VtexProduct, retailer?: ArgentinaVtexRetailer): MlAttribute[] {
  const rows: MlAttribute[] = []
  const seen = new Set<string>()
  const normalizeValue = (value: string) => retailer?.id === 'sony-official'
    ? normalizeSonyOfficialIdentityText(value)
    : value
  const add = (nameValue: unknown, valuesValue: unknown) => {
    const name = text(nameValue)
    const values = Array.isArray(valuesValue) ? valuesValue.map(text).filter(Boolean).map(normalizeValue) : []
    if (!name || !values.length) return
    const key = `${name.toLowerCase()}=${values.join('|').toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push({ name, value_name: values.join(', ') })
  }
  for (const property of product.properties || []) add(property.name, property.values)
  for (const group of product.specificationGroups || []) {
    for (const specification of group.specifications || []) add(specification.name, specification.values)
  }
  if (text(product.brand)) add('Marca', [text(product.brand)])
  if (text(product.productReference)) add('Modelo', [text(product.productReference)])
  return rows.slice(0, 32)
}

function titleOf(product: VtexProduct, item: VtexItem) {
  const productName = text(product.productName)
  const itemName = text(item.nameComplete) || text(item.name)
  if (!itemName || itemName.toLowerCase() === productName.toLowerCase()) return productName
  if (productName.toLowerCase().includes(itemName.toLowerCase())) return productName
  return `${productName} ${itemName}`.trim()
}

function permalinkOf(retailer: ArgentinaVtexRetailer, product: VtexProduct) {
  const direct = text(product.link)
  if (direct) {
    try {
      const url = new URL(direct, retailer.baseUrl)
      if (url.protocol === 'https:' && url.hostname.endsWith(new URL(retailer.baseUrl).hostname)) return url.toString()
    } catch { /* ignore malformed provider link */ }
  }
  const linkText = text(product.linkText).replace(/^\/+|\/+$/g, '')
  return linkText ? `${retailer.baseUrl}/${linkText}/p` : undefined
}

function candidatesFromProducts(retailer: ArgentinaVtexRetailer, products: VtexProduct[]): ArgentinaMarketCandidate[] {
  const candidates: ArgentinaMarketCandidate[] = []
  const maxCandidates = Math.max(1, Math.min(30, retailer.maxCandidates ?? 12))
  for (const product of products) {
    const attributes = attributesOf(product, retailer)
    for (const item of product.items || []) {
      for (const seller of item.sellers || []) {
        const offer = offerOf(seller)
        const priceArs = positiveNumber(offer?.Price)
        if (!priceArs) continue
        if (typeof offer?.AvailableQuantity === 'number' && offer.AvailableQuantity <= 0) continue
        const rawTitle = titleOf(product, item)
        const title = retailer.id === 'sony-official' ? normalizeSonyOfficialIdentityText(rawTitle) : rawTitle
        if (!title) continue
        const itemId = text(item.itemId) || text(product.productId) || `unknown-${candidates.length + 1}`
        const sellerId = text(seller.sellerId) || text(seller.sellerName) || 'seller'
        candidates.push({
          id: `${retailer.id}:${itemId}:${sellerId}`,
          title,
          priceArs,
          condition: 'new',
          sellerKey: `${retailer.name}:${text(seller.sellerName) || sellerId}`,
          permalink: permalinkOf(retailer, product),
          attributes,
        })
        if (candidates.length >= maxCandidates) return candidates
      }
    }
  }
  return candidates
}

async function fetchJsonWithTimeout(fetchImpl: typeof fetch, url: string, requestTimeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'ShippingAPP/2.1 (+Argentina market comparison; public storefront catalog only)',
      },
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false as const, status: response.status, data: null }
    return { ok: true as const, status: response.status, data: await response.json() as unknown }
  } finally {
    clearTimeout(timeout)
  }
}

function intelligentSearchUrl(retailer: ArgentinaVtexRetailer, query: string) {
  const params = new URLSearchParams({ query, count: String(Math.max(1, Math.min(30, retailer.maxCandidates ?? 12))), page: '1' })
  const tradePolicy = encodeURIComponent(retailer.tradePolicy || '1')
  return `${retailer.baseUrl}/api/io/_v/api/intelligent-search/product_search/trade-policy/${tradePolicy}?${params.toString()}`
}

function legacySearchUrl(retailer: ArgentinaVtexRetailer, query: string) {
  const normalized = encodeURIComponent(query.trim())
  return `${retailer.baseUrl}/api/catalog_system/pub/products/search/${normalized}`
}

async function fravegaLandingFallback(
  retailer: ArgentinaVtexRetailer,
  query: string,
  fetchImpl: typeof fetch,
  requestTimeoutMs: number,
  warnings: string[],
): Promise<RetailerDiscovery> {
  const landing = await discoverFravegaLanding(fetchImpl, { timeoutMs: requestTimeoutMs })
  // The Frávega fallback scrapes a fixed best-sellers page, so its candidates are NOT
  // query-scoped. Drop obviously-unrelated products at the source (require a shared query
  // token) instead of relying only on the downstream comparable matcher. The precise
  // ≥55-score matcher still runs afterwards; this just avoids feeding it off-target noise.
  const queryTokens = new Set(
    normalizeForRelevance(query).split(' ').filter((token) => token.length >= 4),
  )
  const relevant = queryTokens.size
    ? landing.candidates.filter((candidate) => {
        const titleTokens = normalizeForRelevance(candidate.title).split(' ')
        return titleTokens.some((token) => token.length >= 4 && queryTokens.has(token))
      })
    : landing.candidates
  const droppedByRelevance = landing.candidates.length - relevant.length
  const mergedWarnings = [
    ...warnings,
    ...landing.warnings,
    ...(droppedByRelevance > 0 ? [`Frávega best-seller landing: ${droppedByRelevance} product(s) dropped for not matching the query before comparable scoring.`] : []),
  ]
  return {
    retailer,
    mode: relevant.length ? 'structured-landing' : 'unavailable',
    candidates: relevant,
    warnings: mergedWarnings,
  }
}

async function discoverRetailer(
  retailer: ArgentinaVtexRetailer,
  query: string,
  fetchImpl: typeof fetch,
  requestTimeoutMs: number,
): Promise<RetailerDiscovery> {
  const warnings: string[] = []
  try {
    const intelligent = await fetchJsonWithTimeout(fetchImpl, intelligentSearchUrl(retailer, query), requestTimeoutMs)
    if (intelligent.ok) {
      const products = productsOf(intelligent.data)
      const candidates = candidatesFromProducts(retailer, products)
      if (products.length || candidates.length) return { retailer, mode: 'intelligent-search', candidates, warnings }
      warnings.push(`${retailer.name} Intelligent Search returned no products; legacy public search was attempted.`)
    } else {
      warnings.push(`${retailer.name} Intelligent Search returned HTTP ${intelligent.status}; legacy public search was attempted.`)
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'request failed'
    warnings.push(`${retailer.name} Intelligent Search failed (${reason}); legacy public search was attempted.`)
  }

  try {
    const legacy = await fetchJsonWithTimeout(fetchImpl, legacySearchUrl(retailer, query), requestTimeoutMs)
    if (legacy.ok) {
      const products = productsOf(legacy.data)
      const candidates = candidatesFromProducts(retailer, products)
      if (products.length || candidates.length) return { retailer, mode: 'legacy-search', candidates, warnings }
      warnings.push(`${retailer.name} legacy public search returned no products.`)
    } else {
      warnings.push(`${retailer.name} legacy public search returned HTTP ${legacy.status}.`)
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'request failed'
    warnings.push(`${retailer.name} legacy public search failed (${reason}).`)
  }

  if (retailer.id === 'fravega') return fravegaLandingFallback(retailer, query, fetchImpl, requestTimeoutMs, warnings)
  return { retailer, mode: 'unavailable', candidates: [], warnings }
}

export function createArgentinaDirectRetailerProvider(options: VtexRetailerMarketProviderOptions = {}): ArgentinaMarketDiscoveryProvider {
  const fetchImpl = options.fetchImpl || fetch
  const configuredRetailers = options.retailers?.length
    ? options.retailers
    : [...DEFAULT_ARGENTINA_VTEX_RETAILERS, ...SPECIALIZED_ARGENTINA_VTEX_RETAILERS]
  const retailers = configuredRetailers.map((retailer) => ({
    ...retailer,
    baseUrl: retailer.baseUrl.replace(/\/+$/, ''),
  }))
  const requestTimeoutMs = Math.max(1000, Math.min(12000, options.requestTimeoutMs ?? 5000))

  return {
    id: 'argentina-direct-retailers',
    async discover(context) {
      const results = await Promise.all(retailers.map((retailer) => discoverRetailer(retailer, context.query, fetchImpl, requestTimeoutMs)))
      const candidates = results.flatMap((result) => result.candidates)
      const available = results.filter((result) => result.mode !== 'unavailable')
      if (!available.length) {
        const diagnostics = results.flatMap((result) => result.warnings).join(' ')
        throw new Error(`Direct Argentine retailer discovery unavailable. ${diagnostics}`.slice(0, 900))
      }
      const contributors = results.filter((result) => result.candidates.length > 0)
      const sourceResults = contributors.length ? contributors : available
      return {
        providerId: 'argentina-direct-retailers',
        sourceLabel: `Retailers argentinos directos · ${sourceResults.map((result) => result.retailer.name).join(' + ')}`,
        candidates,
        categoryHint: null,
        warnings: [
          'Discovery uses public retailer storefront evidence only; no checkout automation, account login, or private API credentials are used.',
          'Retailer prices are treated as ARS because the configured storefronts are Argentine storefronts; every candidate still passes ShippingAPP deterministic product matching before economics.',
          ...results.flatMap((result) => result.warnings),
        ],
      }
    },
  }
}
