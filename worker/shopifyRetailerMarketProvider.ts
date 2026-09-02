import type { ArgentinaMarketCandidate, ArgentinaMarketDiscoveryProvider } from './marketProviderContracts'

export type ArgentinaShopifyRetailer = {
  id: string
  name: string
  baseUrl: string
  maxCandidates?: number
}

export type ShopifyRetailerMarketProviderOptions = {
  fetchImpl?: typeof fetch
  retailer: ArgentinaShopifyRetailer
  requestTimeoutMs?: number
}

type ShopifySuggestProduct = {
  id?: number | string
  title?: string
  price?: string | number
  available?: boolean
  url?: string
}

type ShopifySuggestResponse = {
  resources?: {
    results?: {
      products?: ShopifySuggestProduct[]
    }
  }
}

function positivePrice(value: unknown) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(',', '.')) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function safePermalink(baseUrl: string, value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const base = new URL(baseUrl)
    const url = new URL(value, base)
    if (url.protocol !== 'https:' || url.hostname !== base.hostname) return undefined
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

export function createShopifyRetailerMarketProvider(options: ShopifyRetailerMarketProviderOptions): ArgentinaMarketDiscoveryProvider {
  const fetchImpl = options.fetchImpl || fetch
  const retailer = { ...options.retailer, baseUrl: options.retailer.baseUrl.replace(/\/+$/, '') }
  const maxCandidates = Math.max(1, Math.min(30, retailer.maxCandidates ?? 12))
  const requestTimeoutMs = Math.max(1000, Math.min(12000, options.requestTimeoutMs ?? 5000))

  return {
    id: `shopify-${retailer.id}`,
    async discover(context) {
      const params = new URLSearchParams()
      params.set('q', context.query)
      params.set('resources[type]', 'product')
      params.set('resources[limit]', String(maxCandidates))
      params.set('resources[options][unavailable_products]', 'hide')
      const url = `${retailer.baseUrl}/search/suggest.json?${params.toString()}`
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
      try {
        const response = await fetchImpl(url, {
          headers: {
            accept: 'application/json',
            'user-agent': 'ShippingAPP/2.2 (+Argentina market comparison; public storefront catalog only)',
          },
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`${retailer.name} Shopify suggest returned HTTP ${response.status}.`)
        const payload = await response.json() as ShopifySuggestResponse
        const products = Array.isArray(payload?.resources?.results?.products) ? payload.resources!.results!.products! : []
        const candidates: ArgentinaMarketCandidate[] = []
        for (const product of products) {
          if (product.available === false) continue
          const title = typeof product.title === 'string' ? product.title.trim().replace(/\s+/g, ' ') : ''
          const priceArs = positivePrice(product.price)
          if (!title || !priceArs) continue
          const id = String(product.id ?? `unknown-${candidates.length + 1}`)
          candidates.push({
            id: `${retailer.id}:${id}`,
            title,
            priceArs,
            condition: 'new',
            sellerKey: retailer.name,
            permalink: safePermalink(retailer.baseUrl, product.url),
          })
          if (candidates.length >= maxCandidates) break
        }
        return {
          providerId: `shopify-${retailer.id}`,
          sourceLabel: retailer.name,
          candidates,
          categoryHint: null,
          warnings: [
            `${retailer.name} discovery uses Shopify's public predictive-search JSON endpoint only; no browser scraping, account login, checkout automation, or private API credentials are used.`,
          ],
        }
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}
