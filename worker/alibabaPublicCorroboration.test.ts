import { describe, expect, it, vi } from 'vitest'
import {
  alibabaProductIdFromUrl,
  corroborateAlibabaPublicListing,
  extractExactAlibabaPublicListingFacts,
  publicCorroborationQueries,
} from './alibabaPublicCorroboration'

const watchUrl = new URL('https://www.alibaba.com/product-detail/Fully-Automatic-Mechanical-Watches-42-5MM_1601666174891.html')

function page(cards: string, heading = 'Mechanical Watches') {
  return `<!doctype html><html><body><h1>${heading}</h1>${cards}</body></html>`
}

function card(id: string, title: string, commerce: string) {
  return `<article class="card"><a href="https://www.alibaba.com/product-detail/${title.replace(/\s+/g, '-')}_${id}.html" title="${title}">${title}</a><div>${commerce}</div></article>`
}

describe('Alibaba public listing corroboration', () => {
  it('extracts price and MOQ only from the exact requested product id', () => {
    const html = page([
      card('1600000000001', 'Neighbour cheap watch', '$1.20-1.50 MOQ: 1 piece Cheap Supplier Co., Ltd.'),
      card('1601666174891', 'Fully Automatic Mechanical Watches 42.5MM Green Dial Waterproof 100m Stainless Steel Wristwatch', '$69.50-71.50 MOQ: 5 pieces Guangzhou Ruixu International Trade Co., Ltd.'),
      card('1600000000002', 'Neighbour expensive watch', '$999 MOQ: 500 pieces Other Supplier Co., Ltd.'),
    ].join(''))

    const facts = extractExactAlibabaPublicListingFacts(html, watchUrl, 'https://www.alibaba.com/category/mechanical-watches.html')
    expect(facts?.productId).toBe('1601666174891')
    expect(facts?.name).toContain('Fully Automatic Mechanical Watches')
    expect(facts?.category).toBe('Mechanical Watches')
    expect(facts?.priceRangeUsd).toEqual({ min: 69.5, max: 71.5 })
    expect(facts?.unitPriceUsd).toBe(71.5)
    expect(facts?.moq).toBe(5)
    expect(facts?.supplier).toContain('Guangzhou Ruixu')
    expect(facts?.evidence).toContain('exact_product_id_price')
    expect(facts?.evidence).toContain('exact_product_id_moq')
  })

  it('never borrows commerce facts from a neighbouring product', () => {
    const html = page([
      card('1601666174891', 'Fully Automatic Mechanical Watches 42.5MM', '5 sold'),
      card('1600000000002', 'Different Watch', '$12.00 MOQ: 1 piece Different Supplier Co., Ltd.'),
    ].join(''))
    const facts = extractExactAlibabaPublicListingFacts(html, watchUrl)
    expect(facts?.unitPriceUsd).toBeNull()
    expect(facts?.moq).toBeNull()
  })

  it('rejects bot/challenge pages even if they echo a product id', () => {
    const html = page(`Verify that you are human ${card('1601666174891', 'Mechanical Watch', '$71.50 MOQ: 5 pieces')}`)
    expect(extractExactAlibabaPublicListingFacts(html, watchUrl)).toBeNull()
  })

  it('builds compact watch queries instead of relying only on a huge marketing title', () => {
    const queries = publicCorroborationQueries(watchUrl, { name: 'Fully Automatic Mechanical Watches 42.5MM Green Dial Waterproof 100m Stainless Steel Wristwatch' })
    expect(queries.some((query) => /automatic mechanical watches/i.test(query))).toBe(true)
    expect(queries.length).toBeGreaterThanOrEqual(2)
  })

  it('fetches public Alibaba pages and accepts only an exact product-id match', async () => {
    const targetHtml = page(card(
      '1601666174891',
      'Fully Automatic Mechanical Watches 42.5MM Green Dial Waterproof 100m Stainless Steel Wristwatch',
      '$69.50-71.50 MOQ: 5 pieces Guangzhou Ruixu International Trade Co., Ltd.',
    ))
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      return new Response(url.includes('mechanical') ? targetHtml : page(card('1600000000099', 'Other Product', '$5 MOQ: 1 piece')), { status: 200 })
    })

    const result = await corroborateAlibabaPublicListing(watchUrl, { name: 'Fully Automatic Mechanical Watches 42.5MM' }, fetchMock)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.facts.productId).toBe('1601666174891')
    expect(result.facts.unitPriceUsd).toBe(71.5)
    expect(result.facts.moq).toBe(5)
    expect(result.pagesAttempted).toBeGreaterThan(0)
  })

  it('extracts the stable product id from canonical and tracked detail URLs', () => {
    expect(alibabaProductIdFromUrl(watchUrl)).toBe('1601666174891')
    expect(alibabaProductIdFromUrl(`${watchUrl}?spm=test`)).toBe('1601666174891')
  })
})
