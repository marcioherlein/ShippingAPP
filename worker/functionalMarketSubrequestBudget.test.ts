import { describe, expect, it, vi } from 'vitest'
import { analyzeArgentinaMarketHybrid, selectFunctionalRelaxedRetailers } from './argentinaMarketOrchestrator'
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
  it('uses a small category-aware retailer set only for the relaxed second round', () => {
    expect(selectFunctionalRelaxedRetailers('raqueta de tenis').map((retailer) => retailer.id)).toEqual([
      'fravega', 'cetrogar', 'naldo', 'oncity', 'pardo', 'sportline',
    ])
    expect(selectFunctionalRelaxedRetailers('auriculares bluetooth').map((retailer) => retailer.id)).toEqual([
      'fravega', 'cetrogar', 'naldo', 'oncity', 'pardo', 'coppel', 'sony-official',
    ])
    expect(selectFunctionalRelaxedRetailers('microondas').map((retailer) => retailer.id)).toEqual([
      'fravega', 'cetrogar', 'naldo', 'oncity', 'pardo', 'carrefour',
    ])
  })

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
    // Strict discovery still exercises all ten stores. The relaxed category-only
    // round is limited to five proven generalists plus Sportline for this sports
    // category, leaving substantially more headroom for the rest of /api/intake.
    expect(urls.length).toBeLessThanOrEqual(36)
    expect(urls.filter((url) => url.includes('coppel.com.ar'))).toHaveLength(2)
    expect(urls.filter((url) => url.includes('carrefour.com.ar'))).toHaveLength(2)
    expect(urls.filter((url) => url.includes('easy.com.ar'))).toHaveLength(2)
    expect(urls.filter((url) => url.includes('store.sony.com.ar'))).toHaveLength(2)
    expect(result.warnings.join(' ')).toContain('Worker subrequest budget')
  })
})
