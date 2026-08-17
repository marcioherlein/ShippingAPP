import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './enrich'

const product = (id: number) => `<a href="/product-detail/Carbon-Racket-${id}_160000000000${id}.html" title="Carbon Padel Racket ${id}">Carbon Padel Racket ${id}</a>`

function env(browserHtml = '') {
  return {
    AI: { run: vi.fn() },
    ASSETS: { fetch: vi.fn() },
    BROWSER: {
      quickAction: vi.fn(async () => new Response(browserHtml, { status: 200, headers: { 'X-Browser-Ms-Used': '1500' } })),
    },
  } as any
}

afterEach(() => vi.unstubAllGlobals())

describe('/api/discover', () => {
  it('rejects empty discovery queries before touching Alibaba', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await worker.fetch(new Request('https://shippingapp.example/api/discover', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: ' ' }),
    }), env())
    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns source-backed products ranked by visible title while hard constraints stay pending', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(product(1) + product(2) + product(3), { status: 200 })))
    const e = env()
    const response = await worker.fetch(new Request('https://shippingapp.example/api/discover', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'carbon padel', userText: 'carbon padel de China hasta USD 30 MOQ hasta 100' }),
    }), e)
    const body: any = await response.json()
    expect(response.status).toBe(200)
    expect(body.status).toBe('live')
    expect(body.results).toHaveLength(3)
    expect(body.results.every((item: any) => item.url.startsWith('https://www.alibaba.com/product-detail/'))).toBe(true)
    expect(body.results.every((item: any) => item.evidence === 'live')).toBe(true)
    expect(body.results.every((item: any) => ['strong', 'partial', 'weak'].includes(item.titleMatch))).toBe(true)
    expect(body.constraints).toEqual({ maxUnitPriceUsd: 30, maxMoq: 100, originCountry: 'China', excludedOriginCountries: [], lowMoqPreference: false })
    expect(body.constraintsNote).toContain('pendientes de validar')
    expect(e.BROWSER.quickAction).not.toHaveBeenCalled()
  })

  it('keeps excluded origin separate from required origin', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(product(1) + product(2) + product(3), { status: 200 })))
    const response = await worker.fetch(new Request('https://shippingapp.example/api/discover', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'carbon padel', userText: 'carbon padel no China' }),
    }), env())
    const body: any = await response.json()
    expect(body.constraints.originCountry).toBeNull()
    expect(body.constraints.excludedOriginCountries).toEqual(['China'])
    expect(body.constraintsNote).toContain('origen ≠ China')
  })

  it('returns unavailable with an empty list when no real product links can be sourced', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html><a href="/trade/search">search</a></html>', { status: 200 })))
    const e = env('captcha verify that you are human')
    const response = await worker.fetch(new Request('https://shippingapp.example/api/discover', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'unknown gadget' }),
    }), e)
    const body: any = await response.json()
    expect(body.status).toBe('unavailable')
    expect(body.results).toEqual([])
    expect(body.constraints).toBeDefined()
    expect(e.BROWSER.quickAction).toHaveBeenCalledTimes(1)
  })
})
