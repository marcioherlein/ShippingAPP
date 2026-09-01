import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './entry'
import { INTERNAL_TOKEN_HEADER } from './auth'

const INTERNAL_TOKEN = 'stage5-test-internal-token-0123456789abcdef'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function operationalEnv(extra: Record<string, unknown> = {}) {
  return {
    AUTH_ENFORCEMENT: 'true',
    INTERNAL_API_TOKEN: INTERNAL_TOKEN,
    ...extra,
  }
}

function benchmarkRequest(body: string) {
  return new Request('https://shipping.test/api/argentina-market/benchmark', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [INTERNAL_TOKEN_HEADER]: INTERNAL_TOKEN,
    },
    body,
  })
}

function retailerProducts(prefix: string, title: string, count = 3) {
  return Array.from({ length: count }, (_, index) => ({
    productId: `${prefix}-product-${index + 1}`,
    productName: title,
    brand: title.split(' ')[0],
    productReference: title,
    linkText: `${prefix}-${index + 1}`,
    items: [{
      itemId: `${prefix}-sku-${index + 1}`,
      name: title,
      sellers: [{
        sellerId: `${prefix}-seller-${index + 1}`,
        sellerName: `${prefix} seller ${index + 1}`,
        commertialOffer: {
          Price: 120000 + index * 5000,
          ListPrice: 140000 + index * 5000,
          AvailableQuantity: 5,
        },
      }],
    }],
  }))
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Argentina market hybrid endpoint', () => {
  // These tests focus on provider/orchestration semantics. They deliberately use
  // the server-only operational credential so they cross the real auth boundary
  // without creating a synthetic Clerk user or usage ledger. User metering and
  // quota behavior are covered independently by worker/usage.test.ts.
  it('returns a live Google Shopping fallback benchmark without leaking provider secrets', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (!url.includes('serpapi.com/search.json')) return json({}, 404)
      return json({
        shopping_results: Array.from({ length: 6 }, (_, index) => ({
          title: `Bosch GSB 13 RE 650W Taladro ${index + 1}`,
          price: `$ ${120000 + index * 5000}`,
          extracted_price: 120000 + index * 5000,
          product_id: `bosch-${index + 1}`,
          source: `Tienda ${index + 1}`,
          link: `https://tienda${index + 1}.example.com.ar/bosch-gsb-13-re`,
        })),
      })
    })
    vi.stubGlobal('fetch', fetchImpl)

    const response = await worker.fetch(
      benchmarkRequest(JSON.stringify({ productName: 'Bosch GSB 13 RE 650W', category: 'drill' })),
      operationalEnv({ SERPAPI_API_KEY: 'secret-serp-key' }),
    )
    const text = await response.text()
    const body = JSON.parse(text)

    expect(response.status).toBe(200)
    expect(body.status).toBe('live')
    expect(body.providers.mercadoLibreAuth).toBe('configuration_required')
    expect(body.providers.googleShoppingConfigured).toBe(true)
    expect(body.market.source).toContain('Google Shopping Argentina')
    expect(body.market.comparableCount).toBe(6)
    expect(text).not.toContain('secret-serp-key')
    expect(text).not.toContain(INTERNAL_TOKEN)
  })

  it('produces a live benchmark from Frávega + Cetrogar without Mercado Libre or paid search credentials', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('fravega.com/api/io/_v/api/intelligent-search/')) {
        return json({ products: retailerProducts('fravega', 'Logitech MX Master 3S') })
      }
      if (url.includes('cetrogar.com.ar/api/io/_v/api/intelligent-search/')) {
        return json({ products: retailerProducts('cetrogar', 'Logitech MX Master 3S') })
      }
      if (url.includes('serpapi.com') || url.includes('api.mercadolibre.com')) {
        throw new Error(`paid/authenticated provider should not be needed: ${url}`)
      }
      return json({}, 404)
    })
    vi.stubGlobal('fetch', fetchImpl)

    const response = await worker.fetch(
      benchmarkRequest(JSON.stringify({ productName: 'Logitech MX Master 3S', category: 'mouse' })),
      operationalEnv(),
    )
    const body: any = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('live')
    expect(body.market.source).toContain('Retailers argentinos directos')
    expect(body.market.comparableCount).toBe(6)
    expect(body.market.suggestedPriceArs).toBeGreaterThan(0)
    expect(body.providers.googleShoppingConfigured).toBe(false)
  })

  it('reports free retailer outage truthfully when no authenticated or paid fallback exists', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({}, 503))
    vi.stubGlobal('fetch', fetchImpl)
    const response = await worker.fetch(
      benchmarkRequest(JSON.stringify({ productName: 'Logitech MX Master 3S', category: 'mouse' })),
      operationalEnv(),
    )
    const body: any = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('unavailable')
    expect(body.providers.googleShoppingConfigured).toBe(false)
    expect(body.market.suggestedPriceArs).toBeNull()
  })

  it('rejects malformed JSON before any discovery provider is called', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await worker.fetch(
      benchmarkRequest('{broken'),
      operationalEnv({ SERPAPI_API_KEY: 'secret-serp-key' }),
    )

    expect(response.status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
