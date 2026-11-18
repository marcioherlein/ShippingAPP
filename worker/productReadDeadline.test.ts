import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { productRead } from './entry'
import { hasVerifiedAlibabaIdentity, resolveAlibabaSelfFirst } from './alibabaSelfFirst'
import { extractAlibabaDirectHttp, type DirectAlibabaResult } from './alibabaDirectProvider'
import { extractExactAlibabaPublicListingFacts } from './alibabaPublicCorroboration'

const source = 'https://www.alibaba.com/product-detail/Factory-Manufacture-Inner-Bladder-Basketball-Making_1601389995797.html?spm=a2700.prosearch.normal_offer.d_image.771b67afVPP1xD&priceId=e74649aeab9c4359b570d52c7a348432&priceId=e74649aeab9c4359b570d52c7a348432'
const env: any = { BROWSER: { quickAction: vi.fn() } }
const request = () => new Request('https://shipping.test/api/product-read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: source }) })
const nativeOut = { status: 'unavailable' as const, source: 'Cloudflare Browser Run JSON' as const, facts: null, browserMsUsed: null, warnings: ['unavailable'] }
const structuredOut = { status: 'unavailable' as const, source: 'Parse.bot' as const, facts: null, warnings: ['unavailable'] }
const directOut: DirectAlibabaResult = { status: 'unavailable', source: 'GlobalShipping direct Alibaba', facts: null, httpStatus: 403, warnings: ['blocked'] }
const publicOut = { status: 'unavailable' as const, source: 'Alibaba public listing corroboration' as const, facts: null, pagesAttempted: 0, warnings: [] }
afterEach(() => vi.useRealTimers())

describe('customer Alibaba read deadline and evidence', () => {
  it('reads the exact reported machine from its real public card and advances without waiting for absent logistics', async () => {
    const card = readFileSync(new URL('./fixtures/alibaba-inner-bladder-card.html', import.meta.url), 'utf8')
    const native = vi.fn(async () => nativeOut), structured = vi.fn(async () => structuredOut)
    const response = await productRead(request(), env, (url, bindings, options) => resolveAlibabaSelfFirst(url, bindings, {
      ...options,
      directReader: (target, readOptions) => extractAlibabaDirectHttp(target, async () => new Response(`<html><body>${'product detail '.repeat(20)}</body></html>`), async target => ({ status: 'ready', source: 'Alibaba public listing corroboration', pagesAttempted: 1, warnings: [], facts: extractExactAlibabaPublicListingFacts(card, target)! }), async () => publicOut, readOptions),
      nativeReader: native, parsebotReader: structured,
    }))
    expect(response.status).toBe(200)
    const body: any = await response.json()
    expect(body.product.name).toContain('Basketball Making Machine')
    expect(body.product.name).not.toContain('2,480')
    expect(body.product.supplierEvidence).toMatchObject({ currency: 'EUR', priceText: '€2,480.76' })
    expect(body.product.unitPriceUsd).toBeNull()
    expect(body.product.moq).toBe(1)
    expect(body.product.volumeCbm).toBe(0)
    expect(body.product.packedWeightKg).toBe(0)
    expect(body.product.originCountry).toBe('')
    expect(body.product.category).not.toMatch(/\(\d+\)/)
    expect(hasVerifiedAlibabaIdentity(body)).toBe(true)
    expect(native).not.toHaveBeenCalled(); expect(structured).not.toHaveBeenCalled()
  })

  it('finishes within 20 seconds even when every provider ignores abort', async () => {
    vi.useFakeTimers()
    const hanging = vi.fn(() => new Promise<any>(() => {}))
    const result = productRead(request(), env, (url, bindings, options) => resolveAlibabaSelfFirst(url, bindings, { ...options, directReader: hanging, nativeReader: hanging, parsebotReader: hanging }))
    await vi.advanceTimersByTimeAsync(20_001)
    const response = await result
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'supplier_read_timeout', retryable: true })
    expect(hanging).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not report a URL slug as a successfully read product', async () => {
    const response = await productRead(request(), env, (url, bindings, options) => resolveAlibabaSelfFirst(url, bindings, { ...options, directReader: async () => directOut, nativeReader: async () => nativeOut, parsebotReader: async () => structuredOut }))
    expect(response.status).toBe(503)
    const body: any = await response.json()
    expect(body.code).toBe('supplier_read_unavailable')
    expect(body.product).toBeUndefined()
  })

  it('bounds the HTTP handler even when a replacement reader never resolves', async () => {
    vi.useFakeTimers()
    const reader = vi.fn(() => new Promise(() => {}))
    const result = productRead(request(), env, reader)
    await vi.advanceTimersByTimeAsync(22_001)
    expect((await result).status).toBe(503)
    expect(reader).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not relabel a URL slug when a structured supplier returns only price and MOQ', async () => {
    const response = await productRead(request(), env, (url, bindings, options) => resolveAlibabaSelfFirst(url, bindings, {
      ...options, directReader: async () => directOut, nativeReader: async () => nativeOut,
      parsebotReader: async () => ({ status: 'ready', source: 'Structured supplier', warnings: [], facts: { name: null, productId: '1601389995797', unitPriceUsd: 2700, moq: 1 } }),
    }))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'supplier_read_unavailable' })
  })

  it('does not let a category derived from an unverified URL override the observed machine category', async () => {
    const url = new URL('https://www.alibaba.com/product-detail/Vacuum-Insulated-Bottle-Making_1601389995797.html')
    const result = await resolveAlibabaSelfFirst(url, env, {
      intakeOnly: true, directReader: async () => directOut, nativeReader: async () => nativeOut,
      parsebotReader: async () => ({ status: 'ready', source: 'Structured supplier', warnings: [], facts: { name: 'Vacuum insulated bottle making machine', category: 'Industrial moulding machinery', productId: '1601389995797', unitPriceUsd: 2700, moq: 1 } }),
    })
    expect(result.product.category).toBe('Industrial moulding machinery')
    expect(result.product.categorySource).toBe('supplier')
    expect(hasVerifiedAlibabaIdentity(result)).toBe(true)
    expect(result.confidence.productSource).toBe('parsebot')
  })

  it('lets a bounded direct reader return its partial facts before the outer stage deadline', async () => {
    vi.useFakeTimers()
    const title = 'Factory Manufacture Inner Bladder Basketball Making Machine'
    const html = `<html><head><meta property="og:title" content="${title}"></head><body><script type="application/json">${JSON.stringify({ productTitle: title, categoryName: 'Industrial Machinery', unitPrice: 2700 })}</script>${'supplier product '.repeat(20)}</body></html>`
    const hanging = vi.fn(() => new Promise<any>(() => {}))
    const result = productRead(request(), env, (url, bindings, options) => resolveAlibabaSelfFirst(url, bindings, {
      ...options, directReader: (target, readOptions) => extractAlibabaDirectHttp(target, async () => new Response(html), hanging, async () => publicOut, readOptions),
      nativeReader: async () => nativeOut, parsebotReader: async () => structuredOut,
    }))
    await vi.advanceTimersByTimeAsync(8_001)
    const response = await result
    expect(response.status).toBe(200)
    const body: any = await response.json()
    expect(body.product).toMatchObject({ name: title, unitPriceUsd: 2700, moq: null, packedWeightKg: 0, volumeCbm: 0 })
    expect(hasVerifiedAlibabaIdentity(body)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('returns cancellation metadata when the caller leaves during the bounded retry delay', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const req = new Request(request(), { signal: controller.signal })
    const reader = vi.fn(async () => { throw new Error('temporary upstream failure') })
    const result = productRead(req, env, reader)
    await vi.advanceTimersByTimeAsync(100)
    controller.abort()
    const response = await result
    expect(response.status).toBe(499)
    expect(await response.json()).toMatchObject({ code: 'read_cancelled' })
    expect(reader).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(400)
    expect(vi.getTimerCount()).toBe(0)
  })
})
