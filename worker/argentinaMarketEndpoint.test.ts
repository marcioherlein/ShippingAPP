import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './entry'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Argentina market hybrid endpoint', () => {
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

    const response = await worker.fetch(new Request('https://shipping.test/api/argentina-market/benchmark', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productName: 'Bosch GSB 13 RE 650W', category: 'drill' }),
    }), { SERPAPI_API_KEY: 'secret-serp-key' })
    const text = await response.text()
    const body = JSON.parse(text)

    expect(response.status).toBe(200)
    expect(body.status).toBe('live')
    expect(body.providers.mercadoLibreAuth).toBe('configuration_required')
    expect(body.providers.googleShoppingConfigured).toBe(true)
    expect(body.market.source).toContain('Google Shopping Argentina')
    expect(body.market.comparableCount).toBe(6)
    expect(text).not.toContain('secret-serp-key')
  })

  it('reports provider configuration truthfully when neither source can run', async () => {
    const response = await worker.fetch(new Request('https://shipping.test/api/argentina-market/benchmark', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productName: 'Logitech MX Master 3S', category: 'mouse' }),
    }), {})
    const body: any = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('configuration_required')
    expect(body.providers.googleShoppingConfigured).toBe(false)
    expect(body.market.suggestedPriceArs).toBeNull()
  })

  it('rejects malformed JSON before any discovery provider is called', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await worker.fetch(new Request('https://shipping.test/api/argentina-market/benchmark', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{broken',
    }), { SERPAPI_API_KEY: 'secret-serp-key' })

    expect(response.status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
