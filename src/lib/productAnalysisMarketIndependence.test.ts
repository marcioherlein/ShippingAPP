import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeAlibabaUrlV2 } from './productAnalysisV2'

afterEach(() => vi.unstubAllGlobals())

describe('Product analysis evidence independence', () => {
  it('preserves valid market evidence when full customs retrieval is unavailable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/analyze') {
        return new Response(JSON.stringify({
          sourceUrl: 'https://www.alibaba.com/product-detail/adapter.html',
          fetched: true,
          product: {
            name: 'USB-C 65W power adapter', category: 'Power adapter', unitPriceUsd: 12, moq: 100,
            packedWeightKg: 0.3, volumeCbm: 0.002, originCountry: 'China', imageUrl: null,
          },
          market: {
            estimatedPriceArs: 85000, estimatedMonthlyDemand: 0, source: 'Mercado Libre live',
            details: { status: 'live', confidence: 75, p25Ars: 70000 },
          },
          suggestedQuantities: [100, 200, 500],
          confidence: { overall: 70, productSource: 'live', logistics: 'benchmark', market: 'live-medium' },
          assumptions: [],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/api/ncm-classify') {
        return new Response(JSON.stringify({ error: 'catalog unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`Unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeAlibabaUrlV2('https://www.alibaba.com/product-detail/adapter.html')
    expect(result.market.estimatedPriceArs).toBe(85000)
    expect((result.market as any).details?.status).toBe('live')
    expect(result.customs.dutyRatePct).toBeNull()
    expect(result.customs.source).toContain('fallback seed fail-closed')
  })
})
