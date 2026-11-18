import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import { extractAlibabaDirectHttp } from './alibabaDirectProvider'
import type { AlibabaPublicCorroborationResult } from './alibabaPublicCorroboration'

const watchUrl = new URL('https://www.alibaba.com/product-detail/Fully-Automatic-Mechanical-Watches-42-5MM_1601666174891.html')

function sparseProductPage() {
  return `<!doctype html><html><body><script type="application/json">${JSON.stringify({ productId: '1601666174891' })}</script>${'product detail supplier wholesale '.repeat(30)}</body></html>`
}

function publicWatch(): AlibabaPublicCorroborationResult {
  return {
    status: 'ready',
    source: 'Alibaba public listing corroboration',
    pagesAttempted: 4,
    warnings: ['Matched exact Alibaba product_id 1601666174891 on a public listing surface.'],
    facts: {
      name: 'Fully Automatic Mechanical Watches 42.5MM Green Dial Waterproof 100m Stainless Steel Wristwatch',
      category: 'Mechanical Watches',
      unitPriceUsd: 71.5,
      priceRangeUsd: { min: 69.5, max: 71.5 },
      moq: 5,
      supplier: 'Guangzhou Ruixu International Trade Co., Ltd.',
      productId: '1601666174891',
      sourceUrl: 'https://www.alibaba.com/category/mechanical-watches_201276157.html',
      evidence: ['exact_product_id_title', 'exact_product_id_price', 'exact_product_id_moq', 'listing_page_category'],
    },
  }
}

describe('GlobalShipping direct provider public-listing corroboration', () => {
  it('recovers the selected real machine card and preserves its EUR quote when the detail page is challenged', async () => {
    const target = new URL('https://www.alibaba.com/product-detail/Factory-Manufacture-Inner-Bladder-Basketball-Making_1601389995797.html')
    const card = fs.readFileSync(new URL('./fixtures/alibaba-inner-bladder-card.html', import.meta.url), 'utf8')
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => new Response(String(input).includes('/countrysearch/CN/manufacture-inner-bladder-basketball.html')
      ? card : '<!doctype html><html><body>CAPTCHA verify you are human unusual traffic</body></html>'))
    const highSignal = vi.fn()
    const result = await extractAlibabaDirectHttp(target, fetchImpl, undefined, highSignal)
    expect(result.status).toBe('partial')
    if (result.status === 'unavailable') throw new Error('The exact public card must remain usable')
    expect(result.facts.name).toBe('Factory Manufacture Inner Bladder Basketball Making Machine Single Grain Winding Machine Yarn Winding Machine')
    expect(result.facts.evidence).not.toContain('url_slug_title')
    expect(result.facts.moq).toBe(1)
    expect(result.facts.unitPriceUsd).toBeNull()
    expect(result.facts.supplierEvidence).toMatchObject({ priceText: '€2,480.76', currency: 'EUR', moqText: 'Min. order: 1 set' })
    expect(result.facts.originCountry).toBeNull()
    expect(result.facts.volumeCbm).toBeNull()
    expect(highSignal).not.toHaveBeenCalled()
  })
  it('recovers watch category, price and MOQ for the exact id before Parse.bot or Browser Run', async () => {
    const productFetch = vi.fn(async () => new Response(sparseProductPage(), { status: 200 }))
    const corroboration = vi.fn(async () => publicWatch())

    const result = await extractAlibabaDirectHttp(watchUrl, productFetch, corroboration)
    expect(corroboration).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('partial')
    if (result.status === 'unavailable') return
    expect(result.facts.productId).toBe('1601666174891')
    expect(result.facts.name).toBe('Fully Automatic Mechanical Watches 42.5MM Green Dial Waterproof 100m Stainless Steel Wristwatch')
    expect(result.facts.evidence).not.toContain('url_slug_title')
    expect(result.facts.category).toBe('Mechanical Watches')
    expect(result.facts.unitPriceUsd).toBe(71.5)
    expect(result.facts.moq).toBe(5)
    expect(result.facts.packedWeightKg).toBeNull()
    expect(result.facts.volumeCbm).toBeNull()
    expect(result.facts.originCountry).toBeNull()
    expect(result.warnings.join(' ')).toContain('mismo product_id')
  })

  it('does not invent missing logistics or origin when public listing only has commerce facts', async () => {
    const result = await extractAlibabaDirectHttp(
      watchUrl,
      async () => new Response(sparseProductPage(), { status: 200 }),
      async () => publicWatch(),
    )
    expect(result.status).toBe('partial')
    if (result.status === 'unavailable') return
    expect(result.facts.packedWeightKg).toBeNull()
    expect(result.facts.volumeCbm).toBeNull()
    expect(result.facts.originCountry).toBeNull()
  })
})
