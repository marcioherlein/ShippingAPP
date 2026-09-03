import { describe, expect, it, vi } from 'vitest'
import { analyzeArgentinaMarketHybrid } from './argentinaMarketOrchestrator'
import { resetFravegaLandingCacheForTests } from './fravegaLandingMarketProvider'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function vtexProducts(title: string, count = 6) {
  return Array.from({ length: count }, (_, index) => ({
    productId: `product-${index + 1}`,
    productName: title,
    items: [{
      itemId: `sku-${index + 1}`,
      name: title,
      sellers: [{
        sellerId: `seller-${index + 1}`,
        sellerName: 'Retailer test',
        commertialOffer: {
          Price: 100000 + index * 5000,
          AvailableQuantity: 10,
        },
      }],
    }],
  }))
}

describe('functional Argentina market subrequest budget', () => {
  it('produces a live functional benchmark from direct retailers without calling Mercado Libre', async () => {
    resetFravegaLandingCacheForTests()
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('api.mercadolibre.com')) {
        throw new Error(`functional mode must not call Mercado Libre: ${url}`)
      }
      if (url.includes('cetrogar.com.ar') && url.includes('intelligent-search')) {
        return json(vtexProducts('Mancuerna ajustable 20kg'))
      }
      return json({}, 404)
    })

    const result = await analyzeArgentinaMarketHybrid(
      'Mancuerna ajustable 20kg sin marca',
      'mancuerna',
      { mercadoLibreAccessToken: 'healthy-but-skipped-token', fetchImpl },
    )

    expect(result.matchMode).toBe('functional')
    expect(result.status).toBe('live')
    expect(result.comparableCount).toBeGreaterThanOrEqual(5)
    expect(result.warnings.join(' ')).toContain('Mercado Libre discovery was skipped')
    expect(fetchImpl.mock.calls.some(([input]) => String(input).includes('api.mercadolibre.com'))).toBe(false)
  })

  it('keeps worst-case progressive functional discovery below the Worker provider-fetch budget and never falls through to ML', async () => {
    resetFravegaLandingCacheForTests()
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('api.mercadolibre.com')) {
        throw new Error(`functional mode must not call Mercado Libre: ${url}`)
      }
      // Keep one storefront technically available but without priced candidates
      // so progressive discovery executes both strict and category-only rounds.
      if (url.includes('cetrogar.com.ar') && url.includes('intelligent-search')) {
        return json([{ productId: 'placeholder', productName: 'Sin oferta', items: [] }])
      }
      return json({}, 404)
    })

    const result = await analyzeArgentinaMarketHybrid(
      'Mancuerna ajustable 20kg sin marca',
      'mancuerna',
      { mercadoLibreAccessToken: 'healthy-but-skipped-token', fetchImpl },
    )

    const urls = fetchImpl.mock.calls.map(([input]) => String(input))
    expect(result.matchMode).toBe('functional')
    expect(result.status).not.toBe('live')
    expect(urls.some((url) => url.includes('api.mercadolibre.com'))).toBe(false)
    // Ten direct storefronts, each bounded to Intelligent Search + legacy; the
    // Frávega public landing may add one request per round. This guard leaves
    // headroom under Cloudflare's per-request subrequest ceiling.
    expect(urls.length).toBeLessThanOrEqual(42)
    expect(result.warnings.join(' ')).toContain('Worker subrequest budget')
  })
})
