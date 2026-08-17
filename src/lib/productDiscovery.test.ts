import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverProducts } from './productDiscovery'

afterEach(() => vi.unstubAllGlobals())

describe('product discovery client', () => {
  it('posts only the query and preserves source-backed results', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ query: 'carbon padel' })
      return new Response(JSON.stringify({
        status: 'live', mode: 'direct', query: 'carbon padel', browserAttempted: false, browserMsUsed: null, note: 'live',
        results: [{ title: 'Real Product', url: 'https://www.alibaba.com/product-detail/Real_1600000000001.html', evidence: 'live' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await discoverProducts('carbon padel')
    expect(result.results[0].evidence).toBe('live')
    expect(result.results[0].url).toContain('alibaba.com/product-detail/')
  })

  it('surfaces backend failure instead of manufacturing fallback products', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'search unavailable' }), {
      status: 503, headers: { 'content-type': 'application/json' },
    })))
    await expect(discoverProducts('padel')).rejects.toThrow('search unavailable')
  })
})
