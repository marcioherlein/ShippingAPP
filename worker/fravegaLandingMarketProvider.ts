import type { ArgentinaMarketCandidate } from './marketProviderContracts'
import type { MlAttribute } from './marketTypes'

const FRAVEGA_LANDING_URL = 'https://tyc.fravega.com/e/ofertas/mas-vendidos/'
const DEFAULT_TTL_MS = 5 * 60 * 1000
const MAX_HTML_BYTES = 3_000_000

type FravegaProduct = {
  __typename?: string
  brand?: { name?: string } | null
  title?: string
  slug?: string
  code?: string | number
  categorization?: Array<Array<{ name?: string }>>
  pricingWithNetPrice?: {
    listPrice?: number
    salePrice?: number
    netPrice?: number
  } | null
  stock?: { labels?: string[] } | null
  seller?: { commercialName?: string } | null
}

type CachedLanding = {
  expiresAt: number
  candidates: ArgentinaMarketCandidate[]
}

let cache: CachedLanding | null = null

function text(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function positiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function extractNextData(html: string): unknown | null {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
  if (!match?.[1]) return null
  try { return JSON.parse(match[1]) as unknown } catch { return null }
}

function collectProducts(node: unknown, out = new Map<string, FravegaProduct>(), depth = 0) {
  if (node == null || depth > 24) return out
  if (Array.isArray(node)) {
    for (const item of node) collectProducts(item, out, depth + 1)
    return out
  }
  if (typeof node !== 'object') return out
  const record = node as Record<string, unknown>
  if (record.__typename === 'Product' && text(record.title)) {
    const product = record as FravegaProduct
    const key = text(product.code) || text(product.slug) || text(product.title)
    if (key && !out.has(key)) out.set(key, product)
  }
  for (const value of Object.values(record)) collectProducts(value, out, depth + 1)
  return out
}

function attributesOf(product: FravegaProduct): MlAttribute[] {
  const attributes: MlAttribute[] = []
  const brand = text(product.brand?.name)
  if (brand) attributes.push({ name: 'Marca', value_name: brand })
  const categories = [...new Set((product.categorization || [])
    .flat()
    .map((category) => text(category?.name))
    .filter(Boolean))]
  if (categories.length) attributes.push({ name: 'Categoría', value_name: categories.join(', ') })
  return attributes
}

export function parseFravegaLandingCandidates(html: string): ArgentinaMarketCandidate[] {
  if (!html || html.length > MAX_HTML_BYTES) return []
  const next = extractNextData(html)
  if (!next) return []
  const products = [...collectProducts(next).values()]
  const candidates: ArgentinaMarketCandidate[] = []
  for (const product of products) {
    const title = text(product.title)
    const code = text(product.code)
    const salePrice = positiveNumber(product.pricingWithNetPrice?.salePrice)
    const stockLabels = Array.isArray(product.stock?.labels) ? product.stock!.labels!.map(text).filter(Boolean) : []
    if (!title || !code || !salePrice || stockLabels.length === 0) continue
    const seller = text(product.seller?.commercialName) || 'Frávega marketplace'
    candidates.push({
      id: `fravega:${code}:${seller}`,
      title,
      priceArs: salePrice,
      condition: 'new',
      sellerKey: `Frávega:${seller}`,
      permalink: FRAVEGA_LANDING_URL,
      attributes: attributesOf(product),
    })
  }
  return candidates
}

async function fetchLanding(fetchImpl: typeof fetch, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(FRAVEGA_LANDING_URL, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'ShippingAPP/2.1 (+Argentina market comparison; public storefront catalog only)',
      },
      signal: controller.signal,
    })
    if (!response.ok) return { candidates: [] as ArgentinaMarketCandidate[], warning: `Frávega public landing returned HTTP ${response.status}.` }
    const html = await response.text()
    if (html.length > MAX_HTML_BYTES) return { candidates: [] as ArgentinaMarketCandidate[], warning: 'Frávega public landing exceeded the fail-closed HTML size limit.' }
    const candidates = parseFravegaLandingCandidates(html)
    return {
      candidates,
      warning: candidates.length
        ? null
        : 'Frávega public landing did not expose parseable in-stock structured Product evidence.',
    }
  } catch (error) {
    return {
      candidates: [] as ArgentinaMarketCandidate[],
      warning: `Frávega public landing failed (${error instanceof Error ? error.message : 'request failed'}).`,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function discoverFravegaLanding(
  fetchImpl: typeof fetch = fetch,
  options: { timeoutMs?: number; ttlMs?: number; now?: number } = {},
) {
  const now = options.now ?? Date.now()
  const ttlMs = Math.max(10_000, Math.min(30 * 60 * 1000, options.ttlMs ?? DEFAULT_TTL_MS))
  const timeoutMs = Math.max(1000, Math.min(12_000, options.timeoutMs ?? 5000))
  if (cache && cache.expiresAt > now) {
    return { candidates: cache.candidates, warnings: ['Frávega public landing evidence served from short-lived in-isolate cache.'] }
  }
  const result = await fetchLanding(fetchImpl, timeoutMs)
  if (result.candidates.length) cache = { candidates: result.candidates, expiresAt: now + ttlMs }
  return {
    candidates: result.candidates,
    warnings: [
      'Frávega discovery uses structured Product objects embedded in its public Next.js landing page because its former public VTEX search endpoints currently reject automated requests.',
      ...(result.warning ? [result.warning] : []),
    ],
  }
}

export function resetFravegaLandingCacheForTests() {
  cache = null
}
