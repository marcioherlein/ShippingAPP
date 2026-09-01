import { describe, expect, it, vi } from 'vitest'
import {
  corroborateAlibabaHighSignalRoutes,
  highSignalAlibabaPublicQueries,
  highSignalAlibabaPublicUrls,
} from './alibabaHighSignalCorroboration'

const watchUrl = new URL('https://www.alibaba.com/product-detail/Fully-Automatic-Mechanical-Watches-42-5MM_1601666174891.html')

function targetCard() {
  return `<!doctype html><html><body><h1>100m watch</h1><article><a href="https://www.alibaba.com/product-detail/Fully-Automatic-Mechanical-Watches-42-5MM_1601666174891.html" title="Fully Automatic Mechanical Watches 42.5MM Green Dial Waterproof 100m Stainless Steel Wristwatch">watch</a><div>$69.50-71.50 MOQ: 5 pieces Guangzhou Ruixu International Trade Co., Ltd.</div></article></body></html>`
}

describe('Alibaba high-signal public corroboration', () => {
  it('derives technical queries from the mechanical-watch identity', () => {
    const queries = highSignalAlibabaPublicQueries(watchUrl, {
      name: 'Fully Automatic Mechanical Watches 42.5MM Green Dial Waterproof 100m Stainless Steel Wristwatch',
    })
    expect(queries).toContain('100m watch')
    expect(queries).toContain('mechanical watches')
  })

  it('prioritizes Alibaba countrysearch routes', () => {
    const urls = highSignalAlibabaPublicUrls(watchUrl, {
      name: 'Fully Automatic Mechanical Watches 42.5MM Green Dial Waterproof 100m Stainless Steel Wristwatch',
    })
    expect(urls[0]).toBe('https://www.alibaba.com/countrysearch/CN/100m-watch.html')
    expect(urls).toContain('https://www.alibaba.com/countrysearch/CN/mechanical-watches.html')
  })

  it('recovers commerce facts only from an exact product-id match', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      return new Response(url.includes('/100m-watch.html') ? targetCard() : '<html><body>other products</body></html>', { status: 200 })
    })
    const result = await corroborateAlibabaHighSignalRoutes(watchUrl, {
      name: 'Fully Automatic Mechanical Watches 42.5MM Green Dial Waterproof 100m Stainless Steel Wristwatch',
    }, fetchMock)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.facts.productId).toBe('1601666174891')
    expect(result.facts.unitPriceUsd).toBe(71.5)
    expect(result.facts.moq).toBe(5)
  })

  it('rejects a similarly named neighbouring SKU', async () => {
    const wrong = targetCard().replaceAll('1601666174891', '1600000000001')
    const result = await corroborateAlibabaHighSignalRoutes(watchUrl, {
      name: 'Fully Automatic Mechanical Watches 42.5MM Green Dial Waterproof 100m Stainless Steel Wristwatch',
    }, async () => new Response(wrong, { status: 200 }))
    expect(result.status).toBe('unavailable')
  })
})
