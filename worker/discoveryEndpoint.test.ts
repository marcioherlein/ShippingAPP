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

  it('returns only source-backed live products from direct Alibaba HTML', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(product(1) + product(2) + product(3), { status: 200 })))
    const e = env()
    const response = await worker.fetch(new Request('https://shippingapp.example/api/discover', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'carbon padel' }),
    }), e)
    const body: any = await response.json()
    expect(response.status).toBe(200)
    expect(body.status).toBe('live')
    expect(body.results).toHaveLength(3)
    expect(body.results.every((item: any) => item.url.startsWith('https://www.alibaba.com/product-detail/'))).toBe(true)
    expect(body.results.every((item: any) => item.evidence === 'live')).toBe(true)
    expect(e.BROWSER.quickAction).not.toHaveBeenCalled()
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
    expect(e.BROWSER.quickAction).toHaveBeenCalledTimes(1)
  })
})
