import { describe, expect, it, vi } from 'vitest'
import { extractAlibabaNative } from './nativeAlibaba'
import type { BrowserRun } from './alibabaSource'

const sparseHtml = '<html><head><title>Alibaba</title></head><body>product page shell</body></html>'

function browserWithJson(body: unknown, status = 200, html = sparseHtml): BrowserRun {
  return {
    async quickAction(action: string) {
      if (action === 'content') {
        return new Response(html, {
          status: 200,
          headers: { 'content-type': 'text/html', 'X-Browser-Ms-Used': '400' },
        })
      }
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', 'X-Browser-Ms-Used': '1234' },
      })
    },
  }
}

function browserActionSequence(items: Array<{ action: 'content' | 'json'; body: unknown; status: number; contentType?: string }>) {
  const quickAction = vi.fn(async (action: string) => {
    const next = items.shift() || { action: action as 'content' | 'json', body: { error: 'empty sequence' }, status: 503 }
    expect(action).toBe(next.action)
    const body = next.action === 'content' && typeof next.body === 'string' ? next.body : JSON.stringify(next.body)
    return new Response(body, {
      status: next.status,
      headers: { 'content-type': next.contentType || (next.action === 'content' ? 'text/html' : 'application/json'), 'X-Browser-Ms-Used': '600' },
    })
  })
  return { browser: { quickAction } as BrowserRun, quickAction }
}

const watchUrl = new URL('https://www.alibaba.com/product-detail/Fully-Automatic-Mechanical-Watches-42-5MM_1601666174891.html')

const completeRenderedWatchHtml = `<!doctype html><html><body>
<script type="application/json">${JSON.stringify({
  product_title: 'Fully Automatic Mechanical Watches 42.5MM Stainless Steel Wristwatch',
  category_name: 'Mechanical Wristwatch',
  unit_price: '71.50',
  moq: '5',
  unit_weight: '0.35 kg',
  unit_size: '12X10X8 cm',
  country_of_origin: 'China',
  product_id: '1601666174891',
})}</script>
</body></html>`

const partialRenderedWatchHtml = `<!doctype html><html><body>
<script type="application/json">${JSON.stringify({
  product_title: 'Fully Automatic Mechanical Watches 42.5MM Stainless Steel Wristwatch',
  category_name: 'Mechanical Wristwatch',
  unit_weight: '0.138 kg',
  product_id: '1601666174891',
})}</script>
</body></html>`

describe('extractAlibabaNative', () => {
  it('completes the ficha from rendered HTML and skips structured Browser Run entirely', async () => {
    const quickAction = vi.fn(async (action: string) => {
      expect(action).toBe('content')
      return new Response(completeRenderedWatchHtml, {
        status: 200,
        headers: { 'content-type': 'text/html', 'X-Browser-Ms-Used': '500' },
      })
    })
    const result = await extractAlibabaNative(watchUrl, { quickAction } as BrowserRun)
    expect(quickAction).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.facts.name).toContain('Wristwatch')
    expect(result.facts.category).toBe('Mechanical Wristwatch')
    expect(result.facts.unitPriceUsd).toBe(71.5)
    expect(result.facts.moq).toBe(5)
    expect(result.facts.packedWeightKg).toBe(0.35)
    expect(result.facts.volumeCbm).toBe(0.00096)
    expect(result.facts.originCountry).toBe('China')
    expect(result.facts.productId).toBe('1601666174891')
    expect(result.browserMsUsed).toBe(500)
    expect(result.warnings.join(' ')).toContain('no fue necesario ejecutar Browser Run JSON')
  })

  it('merges deterministic rendered HTML with structured Browser Run facts without overwriting good rendered evidence', async () => {
    const { browser, quickAction } = browserActionSequence([
      { action: 'content', body: partialRenderedWatchHtml, status: 200 },
      {
        action: 'json',
        status: 200,
        body: {
          result: {
            title: 'Marketing title that should not replace rendered identity',
            product_type: 'Mechanical Watches',
            moq: 5,
            unit_price: 71.5,
            unit_size: '12X10X8 cm',
            hs_code: '910221',
            specifications: [{ name: 'Place of Origin', value: 'Chongqing, China' }],
          },
        },
      },
    ])
    const result = await extractAlibabaNative(watchUrl, browser)
    expect(quickAction).toHaveBeenCalledTimes(2)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.facts.name).toContain('Fully Automatic Mechanical Watches')
    expect(result.facts.category).toBe('Mechanical Wristwatch')
    expect(result.facts.unitPriceUsd).toBe(71.5)
    expect(result.facts.moq).toBe(5)
    expect(result.facts.packedWeightKg).toBe(0.138)
    expect(result.facts.volumeCbm).toBe(0.00096)
    expect(result.facts.originCountry).toBe('Chongqing, China')
    expect(result.facts.hsCode).toBe('910221')
    expect(result.warnings.join(' ')).toContain('valores determinísticos tienen prioridad')
  })

  it('normalizes the mechanical watch using structured Browser Run facts', async () => {
    const browser = browserWithJson({
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
    expect(result.browserMsUsed).toBe(1634)
  })

  it('uses explicit Product Type and the first price tier when product_type and moq are absent', async () => {
    const result = await extractAlibabaNative(watchUrl, browserWithJson({
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
    const browser = browserWithJson({
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

  it('uses the explicit Alibaba URL slug as provisional identity when structured JSON omits title', async () => {
    const result = await extractAlibabaNative(watchUrl, browserWithJson({ result: { unit_price: 71.5, moq: 5 } }))
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.facts.name).toContain('Fully Automatic Mechanical Watches')
    expect(result.facts.unitPriceUsd).toBe(71.5)
    expect(result.facts.moq).toBe(5)
  })

  it('still fails closed when Browser Run exposes no product facts beyond the URL identity', async () => {
    const result = await extractAlibabaNative(watchUrl, browserWithJson({ result: {} }))
    expect(result.status).toBe('unavailable')
  })

  it('retries structured JSON HTTP 429 exactly once after the rendered HTML attempt', async () => {
    const { browser, quickAction } = browserActionSequence([
      { action: 'content', body: sparseHtml, status: 200 },
      { action: 'json', body: { error: 'rate limited' }, status: 429 },
      { action: 'json', body: { result: { title: 'Automatic Mechanical Wristwatch', product_type: 'Mechanical Wristwatch' } }, status: 200 },
    ])
    const result = await extractAlibabaNative(watchUrl, browser)
    expect(quickAction).toHaveBeenCalledTimes(3)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.warnings.join(' ')).toContain('429')
  })

  it('preserves partial rendered evidence when structured JSON remains rate-limited', async () => {
    const { browser, quickAction } = browserActionSequence([
      { action: 'content', body: partialRenderedWatchHtml, status: 200 },
      { action: 'json', body: { error: 'rate limited' }, status: 429 },
      { action: 'json', body: { error: 'still rate limited' }, status: 429 },
    ])
    const result = await extractAlibabaNative(watchUrl, browser)
    expect(quickAction).toHaveBeenCalledTimes(3)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.facts.name).toContain('Fully Automatic Mechanical Watches')
    expect(result.facts.category).toBe('Mechanical Wristwatch')
    expect(result.facts.packedWeightKg).toBe(0.138)
    expect(result.facts.unitPriceUsd).toBeNull()
    expect(result.warnings.join(' ')).toContain('rendered HTML evidence is preserved')
  })

  it('fails closed on non-retriable structured HTTP errors when rendered evidence is absent', async () => {
    const result = await extractAlibabaNative(watchUrl, browserWithJson({ error: 'blocked' }, 403))
    expect(result.status).toBe('unavailable')
    if (result.status !== 'unavailable') return
    expect(result.httpStatus).toBe(403)
  })
})
