import { describe, expect, it, vi } from 'vitest'
import { extractAlibabaNative } from './nativeAlibaba'
import type { BrowserRun } from './alibabaSource'

const watchUrl = new URL('https://www.alibaba.com/product-detail/Fully-Automatic-Mechanical-Watches-42-5MM_1601666174891.html')
const sparseHtml = '<html><head><title>Alibaba</title></head><body>product shell</body></html>'

function browser422Then(body: unknown) {
  const requests: any[] = []
  const quickAction = vi.fn(async (action: string, request?: unknown) => {
    requests.push(request)
    const call = quickAction.mock.calls.length
    if (call === 1) {
      expect(action).toBe('content')
      return new Response(sparseHtml, { status: 200, headers: { 'X-Browser-Ms-Used': '300' } })
    }
    if (call === 2) {
      expect(action).toBe('json')
      return new Response(JSON.stringify({ error: 'schema could not be met' }), { status: 422, headers: { 'X-Browser-Ms-Used': '400' } })
    }
    expect(action).toBe('json')
    return new Response(JSON.stringify(body), { status: 200, headers: { 'X-Browser-Ms-Used': '500' } })
  })
  return { browser: { quickAction } as BrowserRun, quickAction, requests }
}

describe('Alibaba Browser Run HTTP 422 recovery', () => {
  it('falls back once to prompt-only extraction and can complete the watch ficha without Parse.bot', async () => {
    const { browser, quickAction, requests } = browser422Then({
      result: {
        title: 'Fully Automatic Mechanical Watches 42.5MM Stainless Steel Wristwatch',
        product_type: 'Mechanical Wristwatch',
        moq: '5 pieces',
        unit_weight: '0.35 kg',
        unit_size: '12X10X8 cm',
        hs_code: '910221',
        product_id: '1601666174891',
        category_path: ['Timepieces', 'Watches', 'Mechanical Watches'],
        specifications: [
          { name: 'Place of Origin', value: 'Chongqing, China' },
          { name: 'Movement', value: 'Automatic Mechanical' },
          { name: 'Case Material', value: 'Stainless Steel' },
        ],
        price_tiers: [{ min_quantity: 5, unit_price: 71.5 }],
      },
    })

    const result = await extractAlibabaNative(watchUrl, browser)
    expect(quickAction).toHaveBeenCalledTimes(3)
    expect(requests[1]).toHaveProperty('response_format')
    expect(requests[2]).not.toHaveProperty('response_format')
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.facts.name).toContain('Wristwatch')
    expect(result.facts.category).toBe('Mechanical Wristwatch')
    expect(result.facts.unitPriceUsd).toBe(71.5)
    expect(result.facts.moq).toBe(5)
    expect(result.facts.packedWeightKg).toBe(0.35)
    expect(result.facts.volumeCbm).toBe(0.00096)
    expect(result.facts.originCountry).toBe('Chongqing, China')
    expect(result.facts.hsCode).toBe('910221')
    expect(result.warnings.join(' ')).toContain('HTTP 422')
    expect(result.warnings.join(' ')).toContain('prompt-only')
    expect(result.browserMsUsed).toBe(1200)
  })

  it('does not trust a bare price merely because the prompt-only fallback returned it', async () => {
    const { browser } = browser422Then({
      result: {
        title: 'Automatic Mechanical Wristwatch',
        product_type: 'Mechanical Wristwatch',
        unit_price: 1.99,
        specifications: [{ name: 'Movement', value: 'Automatic Mechanical' }],
      },
    })

    const result = await extractAlibabaNative(watchUrl, browser)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.facts.unitPriceUsd).toBeNull()
    expect(result.warnings.join(' ')).toContain('no corroborado')
  })
})
