import { describe, expect, it, vi } from 'vitest'
import { buildAlibabaSearchUrl, canonicalAlibabaProductUrl, discoverAlibabaProducts, extractAlibabaProductLinks } from './productDiscovery'

const product = (href: string, title: string) => `<a href="${href}" title="${title}"><span>${title}</span></a>`

function browser(html: string, status = 200, ms = 1200) {
  return {
    quickAction: vi.fn(async () => new Response(html, { status, headers: { 'X-Browser-Ms-Used': String(ms) } })),
  }
}

describe('Alibaba discovery URL/parser adversaries', () => {
  it('builds one official Alibaba search URL and safely encodes the query', () => {
    const url = new URL(buildAlibabaSearchUrl('carbon padel & racket? MOQ < 100'))
    expect(url.origin).toBe('https://www.alibaba.com')
    expect(url.pathname).toBe('/trade/search')
    expect(url.searchParams.get('SearchText')).toBe('carbon padel & racket? MOQ < 100')
    expect(url.searchParams.get('IndexArea')).toBe('product_en')
  })

  it('normalizes only known public https Alibaba product-detail hosts', () => {
    expect(canonicalAlibabaProductUrl('//www.alibaba.com/product-detail/Test_1601234567890.html?spm=x')).toBe('https://www.alibaba.com/product-detail/Test_1601234567890.html')
    expect(canonicalAlibabaProductUrl('/product-detail/Test_1601234567890.html')).toBe('https://www.alibaba.com/product-detail/Test_1601234567890.html')
    expect(canonicalAlibabaProductUrl('https://m.alibaba.com/product-detail/Test_1601234567890.html')).toBe('https://www.alibaba.com/product-detail/Test_1601234567890.html')
    expect(canonicalAlibabaProductUrl('https://seller.alibaba.com/product-detail/Test_1601234567890.html')).toBeNull()
    expect(canonicalAlibabaProductUrl('http://www.alibaba.com/product-detail/Test_1601234567890.html')).toBeNull()
    expect(canonicalAlibabaProductUrl('https://alibaba.com.evil.example/product-detail/Test_1601234567890.html')).toBeNull()
    expect(canonicalAlibabaProductUrl('https://www.alibaba.com/trade/search?SearchText=test')).toBeNull()
  })

  it('extracts only titled product links, dedupes canonical URLs and ignores unrelated anchors', () => {
    const html = [
      '<a href="/trade/search?SearchText=x">Search</a>',
      product('//www.alibaba.com/product-detail/Carbon-Padel_1600000000001.html?spm=a', 'Carbon Padel Racket 12K'),
      product('https://www.alibaba.com/product-detail/Carbon-Padel_1600000000001.html?foo=b', 'Duplicate card'),
      '<a href="https://www.alibaba.com/product-detail/No-title_1600000000002.html">x</a>',
      product('https://evil.example/product-detail/Fake_1600000000003.html', 'Fake Alibaba Product'),
      product('/product-detail/Second_1600000000004.html', 'Second Carbon Padel Racket'),
    ].join('')
    const results = extractAlibabaProductLinks(html)
    expect(results).toHaveLength(2)
    expect(results[0].title).toBe('Carbon Padel Racket 12K')
    expect(results[0].url).toBe('https://www.alibaba.com/product-detail/Carbon-Padel_1600000000001.html')
    expect(new Set(results.map((item) => item.url)).size).toBe(results.length)
  })

  it('returns zero products from bot/challenge HTML even if product-like links are embedded', () => {
    const html = `Verify that you are human captcha ${product('/product-detail/Fake_1600000000001.html', 'Fake Product Result')}`
    expect(extractAlibabaProductLinks(html)).toEqual([])
  })

  it('does not attribute neighboring price or MOQ text to a discovered product', () => {
    const html = `$9.99 MOQ 1 piece ${product('/product-detail/Safe_1600000000001.html', 'Verified Linked Product')} $999 MOQ 5000`
    const [result] = extractAlibabaProductLinks(html)
    expect(result).toEqual({
      title: 'Verified Linked Product',
      url: 'https://www.alibaba.com/product-detail/Safe_1600000000001.html',
      evidence: 'live',
    })
    expect(Object.keys(result)).toEqual(['title', 'url', 'evidence'])
  })

  it('rejects ambiguous whole-card body text when no explicit title evidence exists', () => {
    const html = '<a href="/product-detail/Card_1600000000010.html"><div>Carbon Padel Racket $25 MOQ 100 pieces 20 sold</div></a>'
    expect(extractAlibabaProductLinks(html)).toEqual([])
  })
})

describe('Alibaba discovery provider adversaries', () => {
  const three = [
    product('/product-detail/A_1600000000001.html', 'Carbon Padel Racket A'),
    product('/product-detail/B_1600000000002.html', 'Carbon Padel Racket B'),
    product('/product-detail/C_1600000000003.html', 'Carbon Padel Racket C'),
  ].join('')

  it('does not spend Browser Run when direct HTML has at least three real product URLs', async () => {
    const b = browser('')
    const fetchMock = vi.fn(async () => new Response(three, { status: 200 }))
    const result = await discoverAlibabaProducts('carbon padel racket', b, fetchMock)
    expect(result.status).toBe('live')
    expect(result.mode).toBe('direct')
    expect(result.results).toHaveLength(3)
    expect(b.quickAction).not.toHaveBeenCalled()
  })

  it('uses Browser Run only when direct search is insufficient and returns its source evidence', async () => {
    const b = browser(three, 200, 2345)
    const fetchMock = vi.fn(async () => new Response(product('/product-detail/A_1600000000001.html', 'Only One Direct Product'), { status: 200 }))
    const result = await discoverAlibabaProducts('padel', b, fetchMock)
    expect(result.status).toBe('live')
    expect(result.mode).toBe('browser')
    expect(result.browserAttempted).toBe(true)
    expect(result.browserMsUsed).toBe(2345)
    expect(b.quickAction).toHaveBeenCalledTimes(1)
  })

  it('fails closed with zero synthetic results if both direct and browser sources fail', async () => {
    const b = browser('security verification captcha')
    const fetchMock = vi.fn(async () => new Response('access denied', { status: 403 }))
    const result = await discoverAlibabaProducts('mystery product', b, fetchMock)
    expect(result.status).toBe('unavailable')
    expect(result.results).toEqual([])
    expect(result.note).toContain('no genera una lista sintética')
  })
})
