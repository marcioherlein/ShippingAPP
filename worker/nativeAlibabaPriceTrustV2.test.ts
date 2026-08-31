import { describe, expect, it } from 'vitest'
import { extractAlibabaNative } from './nativeAlibaba'
import type { BrowserRun } from './alibabaSource'

const url = new URL('https://www.alibaba.com/product-detail/Generic-Smart-Device_1600000000099.html')
const sparseHtml = '<html><head><title>Alibaba</title></head><body>product page shell product detail supplier wholesale '.repeat(8) + '</body></html>'

function browser(result: Record<string, unknown>, html = sparseHtml): BrowserRun {
  return {
    async quickAction(action: string) {
      if (action === 'content') return new Response(html, { status: 200, headers: { 'X-Browser-Ms-Used': '100' } })
      return new Response(JSON.stringify({ result }), { status: 200, headers: { 'content-type': 'application/json', 'X-Browser-Ms-Used': '200' } })
    },
  }
}

describe('Native Alibaba price trust V2', () => {
  it('withholds a bare Browser unit_price even when MOQ and other product facts are present', async () => {
    const result = await extractAlibabaNative(url, browser({
      title: 'Generic Smart Device',
      product_type: 'Smart Device',
      unit_price: 1,
      moq: 100,
      unit_weight: '2.5 kg',
      unit_size: '30 x 20 x 14 cm',
    }))
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.facts.unitPriceUsd).toBeNull()
    expect(result.facts.moq).toBe(100)
    expect(result.warnings.join(' ')).toContain('no corroborado')
  })

  it('accepts a structured price tier only when it has a minimum quantity', async () => {
    const accepted = await extractAlibabaNative(url, browser({
      title: 'Generic Smart Device', product_type: 'Smart Device', unit_price: 18.5,
      price_tiers: [{ min_quantity: 100, unit_price: 18.5 }],
    }))
    expect(accepted.status).toBe('ready')
    if (accepted.status === 'ready') expect(accepted.facts.unitPriceUsd).toBe(18.5)

    const rejected = await extractAlibabaNative(url, browser({
      title: 'Generic Smart Device', product_type: 'Smart Device', unit_price: 18.5,
      price_tiers: [{ unit_price: 18.5 }],
    }))
    expect(rejected.status).toBe('ready')
    if (rejected.status === 'ready') expect(rejected.facts.unitPriceUsd).toBeNull()
  })

  it('keeps deterministic rendered offer price when Browser unit_price conflicts', async () => {
    const renderedHtml = `<!doctype html><html><body>
      <meta property="og:title" content="Generic Smart Device">
      <div>FOB Price: USD 22.40 / piece</div>
      <div>Minimum Order Quantity: 10 pieces</div>
      ${'product detail supplier wholesale '.repeat(30)}
    </body></html>`
    const result = await extractAlibabaNative(url, browser({
      title: 'Generic Smart Device', product_type: 'Smart Device', unit_price: 1, moq: 10,
    }, renderedHtml))
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.facts.unitPriceUsd).toBe(22.4)
    expect(result.warnings.join(' ')).toContain('contradijo')
  })

  it('allows Browser unit_price to corroborate a matching deterministic rendered price', async () => {
    const renderedHtml = `<!doctype html><html><body>
      <meta property="og:title" content="Generic Smart Device">
      <div>Unit Price: USD 22.40</div>
      ${'product detail supplier wholesale '.repeat(30)}
    </body></html>`
    const result = await extractAlibabaNative(url, browser({
      title: 'Generic Smart Device', product_type: 'Smart Device', unit_price: 22.4,
    }, renderedHtml))
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.facts.unitPriceUsd).toBe(22.4)
  })
})
