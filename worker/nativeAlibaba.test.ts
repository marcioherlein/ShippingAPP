import { describe, expect, it, vi } from 'vitest'
import { extractAlibabaNative } from './nativeAlibaba'
import type { BrowserRun } from './alibabaSource'

function browserWith(body: unknown, status = 200): BrowserRun {
  return {
    async quickAction() {
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', 'X-Browser-Ms-Used': '1234' },
      })
    },
  }
}

function browserSequence(items: Array<{ body: unknown; status: number }>) {
  const quickAction = vi.fn(async () => {
    const next = items.shift() || { body: { error: 'empty sequence' }, status: 503 }
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { 'content-type': 'application/json', 'X-Browser-Ms-Used': '1234' },
    })
  })
  return { browser: { quickAction } as BrowserRun, quickAction }
}

const watchUrl = new URL('https://www.alibaba.com/product-detail/Fully-Automatic-Mechanical-Watches-42-5MM_1601666174891.html')

describe('extractAlibabaNative', () => {
  it('normalizes the mechanical watch using structured Browser Run facts', async () => {
    const browser = browserWith({
      success: true,
      result: {
        title: 'Fully Automatic Mechanical Watches 42.5MM Green Dial Waterproof 100m Stainless Steel Wristwatch',
        product_type: 'Mechanical Wristwatch',
        moq: '5 pieces',
        unit_price: '71.50',
        unit_weight: '0.35 kg',
        unit_volume: null,
        unit_size: '12X10X8 cm',
        hs_code: '910221',
        product_id: '1601666174891',
        product_category_id: '100006206',
        quantity_unit: 'pieces',
        supplier_name: 'Example Watch Co.',
        supplier_country: 'CN',
        category_path: ['Timepieces', 'Watches', 'Mechanical Watches'],
        supplier_badges: ['Verified Supplier'],
        specifications: [
          { name: 'Place of Origin', value: 'Chongqing, China' },
          { name: 'Movement', value: 'Automatic Mechanical' },
          { name: 'Case Material', value: 'Stainless Steel' },
        ],
        price_tiers: [{ min_quantity: 5, max_quantity: 49, unit_price: 71.5, price_value: 71.5 }],
        packaging: { package_dimensions: '12X10X8 cm', package_weight: '0.40 kg', selling_units: 'Single item' },
      },
    })

    const result = await extractAlibabaNative(watchUrl, browser)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.facts.name).toContain('Wristwatch')
    expect(result.facts.category).toBe('Mechanical Wristwatch')
    expect(result.facts.categoryPath).toEqual(['Timepieces', 'Watches', 'Mechanical Watches'])
    expect(result.facts.unitPriceUsd).toBe(71.5)
    expect(result.facts.moq).toBe(5)
    expect(result.facts.packedWeightKg).toBe(0.35)
    expect(result.facts.volumeCbm).toBe(0.00096)
    expect(result.facts.originCountry).toBe('Chongqing, China')
    expect(result.facts.supplierCountry).toBe('CN')
    expect(result.facts.hsCode).toBe('910221')
    expect(result.facts.productId).toBe('1601666174891')
    expect(result.browserMsUsed).toBe(1234)
  })

  it('uses explicit Product Type and the first price tier when product_type and moq are absent', async () => {
    const result = await extractAlibabaNative(watchUrl, browserWith({
      result: {
        title: 'Automatic Mechanical Wristwatch',
        product_type: null,
        moq: null,
        unit_price: 71.5,
        price_tiers: [{ min_quantity: '5 pieces', unit_price: 71.5 }],
        specifications: [
          { name: 'Product Type', value: 'Mechanical Wristwatch' },
          { name: 'Movement', value: 'Automatic Mechanical' },
        ],
      },
    }))
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.facts.category).toBe('Mechanical Wristwatch')
    expect(result.facts.moq).toBe(5)
  })

  it('does not substitute supplier country for merchandise origin', async () => {
    const browser = browserWith({
      result: {
        title: 'Automatic Mechanical Wristwatch',
        product_type: 'Mechanical Wristwatch',
        supplier_country: 'CN',
        specifications: [{ name: 'Movement', value: 'Automatic' }],
      },
    })
    const result = await extractAlibabaNative(watchUrl, browser)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.facts.supplierCountry).toBe('CN')
    expect(result.facts.originCountry).toBeNull()
    expect(result.warnings.some((warning) => warning.includes('Origen'))).toBe(true)
  })

  it('uses the explicit Alibaba URL slug as provisional identity when rendered JSON omits title', async () => {
    const result = await extractAlibabaNative(watchUrl, browserWith({ result: { unit_price: 71.5, moq: 5 } }))
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.facts.name).toContain('Fully Automatic Mechanical Watches')
    expect(result.facts.unitPriceUsd).toBe(71.5)
    expect(result.facts.moq).toBe(5)
  })

  it('still fails closed when Browser Run exposes no product facts beyond the URL identity', async () => {
    const result = await extractAlibabaNative(watchUrl, browserWith({ result: {} }))
    expect(result.status).toBe('unavailable')
  })

  it('retries HTTP 429 exactly once and keeps the recovered evidence', async () => {
    const { browser, quickAction } = browserSequence([
      { body: { error: 'rate limited' }, status: 429 },
      { body: { result: { title: 'Automatic Mechanical Wristwatch', product_type: 'Mechanical Wristwatch' } }, status: 200 },
    ])
    const result = await extractAlibabaNative(watchUrl, browser)
    expect(quickAction).toHaveBeenCalledTimes(2)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.warnings.join(' ')).toContain('429')
  })

  it('fails closed on non-retriable Browser Run HTTP errors', async () => {
    const result = await extractAlibabaNative(watchUrl, browserWith({ error: 'blocked' }, 403))
    expect(result.status).toBe('unavailable')
    if (result.status !== 'unavailable') return
    expect(result.httpStatus).toBe(403)
  })
})
