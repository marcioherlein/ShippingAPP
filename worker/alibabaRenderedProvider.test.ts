import { describe, expect, it, vi } from 'vitest'
import { extractAlibabaRenderedHtml } from './alibabaRenderedProvider'
import type { BrowserRun } from './alibabaSource'

const watchUrl = new URL('https://www.alibaba.com/product-detail/Fully-Automatic-Mechanical-Watches-42-5MM_1601666174891.html')

function renderedHtml() {
  return `<!doctype html><html><head>
    <meta property="og:title" content="Fully Automatic Mechanical Watches 42.5MM Stainless Steel Wristwatch">
    <script type="application/json">${JSON.stringify({
      productTitle: 'Fully Automatic Mechanical Watches 42.5MM Stainless Steel Wristwatch',
      productId: '1601666174891',
      categoryPath: ['Timepieces', 'Watches', 'Mechanical Watches'],
      categoryName: 'Mechanical Watches',
      minPrice: '71.50',
      minimumOrderQuantity: '5',
      unitWeight: '0.138 kg',
      packageDimensions: '12 x 10 x 8 cm',
      countryOfOrigin: 'China',
      hsCode: '910221',
      specifications: [
        { name: 'Movement', value: 'Automatic Mechanical' },
        { name: 'Material', value: 'Stainless Steel' },
        { name: 'Place of Origin', value: 'China' },
      ],
    })}</script>
  </head><body>Alibaba product detail</body></html>`
}

function browserWithContent(html: string, status = 200) {
  const quickAction = vi.fn(async (action: string) => {
    expect(action).toBe('content')
    return new Response(html, { status, headers: { 'X-Browser-Ms-Used': '850' } })
  })
  return { browser: { quickAction } as BrowserRun, quickAction }
}

describe('extractAlibabaRenderedHtml', () => {
  it('runs the deterministic HTML/JSON parser over Chromium-rendered Alibaba content', async () => {
    const { browser } = browserWithContent(renderedHtml())
    const result = await extractAlibabaRenderedHtml(watchUrl, browser)
    expect(result.status).toBe('ready')
    if (result.status === 'unavailable') return
    expect(result.facts.name).toContain('Mechanical Watches')
    expect(result.facts.category).toBe('Mechanical Watches')
    expect(result.facts.unitPriceUsd).toBe(71.5)
    expect(result.facts.moq).toBe(5)
    expect(result.facts.packedWeightKg).toBe(0.138)
    expect(result.facts.volumeCbm).toBe(0.00096)
    expect(result.facts.originCountry).toBe('China')
    expect(result.facts.hsCode).toBe('910221')
    expect(result.browserMsUsed).toBe(850)
  })

  it('does not call an LLM extraction path when rendered HTML already contains the data', async () => {
    const { browser, quickAction } = browserWithContent(renderedHtml())
    const result = await extractAlibabaRenderedHtml(watchUrl, browser)
    expect(result.status).toBe('ready')
    expect(quickAction).toHaveBeenCalledTimes(1)
    expect(quickAction.mock.calls[0]?.[0]).toBe('content')
  })

  it('fails closed when Chromium exposes only a generic challenge page', async () => {
    const html = '<html><body>' + 'security verification captcha '.repeat(20) + '</body></html>'
    const { browser } = browserWithContent(html)
    const result = await extractAlibabaRenderedHtml(watchUrl, browser)
    expect(result.status).toBe('unavailable')
  })

  it('retries a rendered-content 429 once', async () => {
    const responses = [
      new Response('rate limited', { status: 429 }),
      new Response(renderedHtml(), { status: 200 }),
    ]
    const quickAction = vi.fn(async () => responses.shift() || new Response('', { status: 503 }))
    const result = await extractAlibabaRenderedHtml(watchUrl, { quickAction })
    expect(quickAction).toHaveBeenCalledTimes(2)
    expect(result.status).toBe('ready')
  })
})
