import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverProducts } from './productDiscovery'

afterEach(() => vi.unstubAllGlobals())

describe('product discovery client', () => {
  it('preserves source-backed results and parsed user budget', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ query: 'carbon padel', userText: 'Tengo USD 10000; carbon padel hasta USD 30' })
      return new Response(JSON.stringify({
        status: 'live', mode: 'direct', query: 'carbon padel', browserAttempted: false, browserMsUsed: null, note: 'live',
        constraints: { maxUnitPriceUsd: 30, maxMoq: null, originCountry: null, excludedOriginCountries: [], lowMoqPreference: false, availableCapitalUsd: 10000 },
        constraintsNote: 'capital pending landed cost',
        results: [{ title: 'Real Product', url: 'https://www.alibaba.com/product-detail/Real_1600000000001.html', evidence: 'live', titleMatch: 'partial', matchedTerms: ['carbon'] }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await discoverProducts('carbon padel', 'Tengo USD 10000; carbon padel hasta USD 30')
    expect(result.results[0].evidence).toBe('live')
    expect(result.constraints.maxUnitPriceUsd).toBe(30)
    expect(result.constraints.availableCapitalUsd).toBe(10000)
  })

  it('surfaces backend failure instead of manufacturing fallback products', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'search unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } })))
    await expect(discoverProducts('padel')).rejects.toThrow('search unavailable')
  })
})
