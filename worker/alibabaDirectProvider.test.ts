import { describe, expect, it, vi } from 'vitest'
import { extractAlibabaDirectHttp } from './alibabaDirectProvider'

const watchUrl = new URL('https://www.alibaba.com/product-detail/Fully-Automatic-Mechanical-Watches-42-5MM_1601666174891.html')

function htmlWithProduct(product: Record<string, unknown>) {
  return `<!doctype html><html><head><meta property="og:title" content="${String(product.productTitle || 'Alibaba product')}"></head><body><script>window.__PRODUCT__ = ${JSON.stringify({ product })};</script>${'product detail supplier wholesale '.repeat(30)}</body></html>`
}

describe('ShippingAPP direct Alibaba provider', () => {
  it('returns ready when all seven core quotation signals are explicit', async () => {
    const fetchImpl = vi.fn(async () => new Response(htmlWithProduct({
      productId: '1601666174891',
      productTitle: 'Fully Automatic Mechanical Stainless Steel Wristwatch',
      productType: 'Mechanical Wristwatch',
      priceValue: '71.50',
      moq: 5,
      unitWeight: '0.18 kg',
      unitSize: '12 x 10 x 8 cm',
      specifications: [{ name: 'Place of Origin', value: 'China' }],
    }), { status: 200 }))
    const result = await extractAlibabaDirectHttp(watchUrl, fetchImpl)
    expect(result.status).toBe('ready')
    if (result.status === 'unavailable') return
    expect(result.facts.unitPriceUsd).toBe(71.5)
    expect(result.facts.moq).toBe(5)
    expect(result.facts.packedWeightKg).toBe(0.18)
    expect(result.facts.volumeCbm).toBe(0.00096)
    expect(result.facts.originCountry).toBe('China')
  })

  it('returns partial instead of inventing logistics when the page only exposes identity and price', async () => {
    const fetchImpl = vi.fn(async () => new Response(htmlWithProduct({
      productId: '1601666174891', productTitle: 'Mechanical Wristwatch', productType: 'Wristwatch', priceValue: 71.5,
    }), { status: 200 }))
    const result = await extractAlibabaDirectHttp(watchUrl, fetchImpl)
    expect(result.status).toBe('partial')
    if (result.status === 'unavailable') return
    expect(result.facts.packedWeightKg).toBeNull()
    expect(result.facts.volumeCbm).toBeNull()
    expect(result.warnings.some((warning) => warning.includes('Peso'))).toBe(true)
  })

  it('fails closed on HTTP blocking', async () => {
    const result = await extractAlibabaDirectHttp(watchUrl, async () => new Response('blocked', { status: 403 }))
    expect(result.status).toBe('unavailable')
    if (result.status !== 'unavailable') return
    expect(result.httpStatus).toBe(403)
  })

  it('preserves only URL identity when the HTML is an anti-bot challenge', async () => {
    const challenge = `<!doctype html><html><body>${'CAPTCHA verify you are human unusual traffic '.repeat(40)}</body></html>`
    const result = await extractAlibabaDirectHttp(watchUrl, async () => new Response(challenge, { status: 200 }))
    expect(result.status).toBe('partial')
    if (result.status === 'unavailable') return
    expect(result.facts.name).toContain('Fully Automatic Mechanical Watches')
    expect(result.facts.productId).toBe('1601666174891')
    expect(result.facts.unitPriceUsd).toBeNull()
    expect(result.facts.moq).toBeNull()
    expect(result.facts.packedWeightKg).toBeNull()
    expect(result.facts.volumeCbm).toBeNull()
    expect(result.facts.evidence).toContain('url_slug_title')
    expect(result.warnings.join(' ')).toContain('identidad provisional')
  })

  it('turns network exceptions into controlled unavailability', async () => {
    const result = await extractAlibabaDirectHttp(watchUrl, async () => { throw new Error('network timeout') })
    expect(result.status).toBe('unavailable')
    if (result.status !== 'unavailable') return
    expect(result.warnings.join(' ')).toContain('network timeout')
  })
})
