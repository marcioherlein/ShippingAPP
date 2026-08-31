import { describe, expect, it, vi } from 'vitest'
import { analyzeArgentinaMarketHybrid } from './argentinaMarketOrchestrator'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function googleResults(title: string, count = 6) {
  return Array.from({ length: count }, (_, index) => ({
    position: index + 1,
    title: `${title} ${index + 1}`,
    price: `$ ${145000 + index * 5000}`,
    extracted_price: 145000 + index * 5000,
    product_id: `g-${index + 1}`,
    source: `Tienda ${index + 1}`,
    link: `https://tienda${index + 1}.example.com.ar/producto`,
  }))
}

describe('Argentina market hybrid orchestrator', () => {
  it('keeps Mercado Libre as primary when it already produces a live benchmark', async () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: `MLA${1000000 + i}`,
      title: `Logitech MX Master 3S ${i + 1}`,
      price: 140000 + i * 5000,
      currency_id: 'ARS',
      condition: 'new',
      category_id: 'MLA-MOUSE',
      seller: { id: i + 1 },
    }))
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('serpapi.com')) throw new Error('secondary provider should not be called')
      if (url.includes('/domain_discovery/search')) return json([{ category_id: 'MLA-MOUSE', category_name: 'Mouse' }])
      if (url.includes('/sites/MLA/search')) return json({ results: items })
      if (url.includes('/sale_price')) return json({ amount: 150000, currency_id: 'ARS' })
      return json({}, 404)
    })

    const result = await analyzeArgentinaMarketHybrid('Logitech MX Master 3S', 'mouse', {
      mercadoLibreAccessToken: 'ml-token',
      googleShoppingApiKey: 'serp-key',
      fetchImpl,
    })

    expect(result.status).toBe('live')
    expect(result.source).toContain('Mercado Libre Argentina API')
    expect(fetchImpl.mock.calls.some(([input]) => String(input).includes('serpapi.com'))).toBe(false)
  })

  it('falls back to Google Shopping Argentina when Mercado Libre has insufficient discovery', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/domain_discovery/search')) return json([])
      if (url.includes('/sites/MLA/search')) return json({ results: [] })
      if (url.includes('serpapi.com')) return json({ shopping_results: googleResults('Logitech MX Master 3S') })
      return json({}, 404)
    })

    const result = await analyzeArgentinaMarketHybrid('Logitech MX Master 3S', 'mouse', {
      mercadoLibreAccessToken: 'ml-token',
      googleShoppingApiKey: 'serp-key',
      fetchImpl,
    })

    expect(result.status).toBe('live')
    expect(result.comparableCount).toBe(6)
    expect(result.source).toContain('Google Shopping Argentina')
    expect(result.warnings.join(' ')).toContain('Mercado Libre primary discovery returned insufficient')
  })

  it('can produce a live benchmark from Google Shopping even when Mercado Libre auth is not configured', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('api.mercadolibre.com')) throw new Error('ML must not be called without a token')
      if (url.includes('serpapi.com')) return json({ shopping_results: googleResults('Bosch GSB 13 RE 650W') })
      return json({}, 404)
    })

    const result = await analyzeArgentinaMarketHybrid('Bosch GSB 13 RE 650W', 'drill', {
      googleShoppingApiKey: 'serp-key',
      fetchImpl,
    })

    expect(result.status).toBe('live')
    expect(result.source).toContain('Google Shopping Argentina')
    expect(result.suggestedPriceArs).toBeGreaterThan(0)
  })

  it('does not promote wrong variants or foreign-currency results into economics', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/domain_discovery/search')) return json([])
      if (url.includes('/sites/MLA/search')) return json({ results: [] })
      if (url.includes('serpapi.com')) return json({
        shopping_results: [
          ...googleResults('Logitech MX Master 2S', 6),
          { title: 'Logitech MX Master 3S', price: 'USD 100', extracted_price: 100, product_id: 'usd' },
        ],
      })
      return json({}, 404)
    })

    const result = await analyzeArgentinaMarketHybrid('Logitech MX Master 3S', 'mouse', {
      mercadoLibreAccessToken: 'ml-token',
      googleShoppingApiKey: 'serp-key',
      fetchImpl,
    })

    expect(result.status).not.toBe('live')
    expect(result.suggestedPriceArs).toBeNull()
  })

  it('uses Mercado Libre effective sale_price only for Google-discovered candidates with a real MLA item id', async () => {
    const results = googleResults('Logitech MX Master 3S')
    results[0] = {
      ...results[0],
      product_id: undefined as any,
      source: 'Mercado Libre',
      link: 'https://articulo.mercadolibre.com.ar/MLA-1432123456-logitech-mx-master-3s-_JM',
    }
    let salePriceCalls = 0
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/domain_discovery/search')) return json([])
      if (url.includes('/sites/MLA/search')) return json({ results: [] })
      if (url.includes('serpapi.com')) return json({ shopping_results: results })
      if (url.includes('/items/MLA1432123456/sale_price')) {
        salePriceCalls += 1
        return json({ amount: 142000, currency_id: 'ARS' })
      }
      if (url.includes('/sale_price')) throw new Error(`unexpected sale_price call: ${url}`)
      return json({}, 404)
    })

    const result = await analyzeArgentinaMarketHybrid('Logitech MX Master 3S', 'mouse', {
      mercadoLibreAccessToken: 'ml-token',
      googleShoppingApiKey: 'serp-key',
      fetchImpl,
    })

    expect(result.status).toBe('live')
    expect(result.effectivePriceCount).toBe(1)
    expect(result.priceQuality).toBe('mixed_sale_and_search_price')
    expect(salePriceCalls).toBe(1)
  })

  it('keeps the best fail-closed primary evidence when the secondary provider is unavailable', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/domain_discovery/search')) return json([])
      if (url.includes('/sites/MLA/search')) return json({ results: [] })
      if (url.includes('serpapi.com')) return json({ error: 'rate limited' }, 429)
      return json({}, 404)
    })

    const result = await analyzeArgentinaMarketHybrid('Logitech MX Master 3S', 'mouse', {
      mercadoLibreAccessToken: 'ml-token',
      googleShoppingApiKey: 'serp-key',
      fetchImpl,
    })

    expect(result.status).toBe('insufficient')
    expect(result.suggestedPriceArs).toBeNull()
    expect(result.warnings.join(' ')).toContain('Secondary Argentina market evidence also did not reach the live floor')
  })
})
