import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  discoverFravegaLanding,
  parseFravegaLandingCandidates,
  resetFravegaLandingCacheForTests,
} from './fravegaLandingMarketProvider'

function html(products: unknown[]) {
  return `<!doctype html><html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { initialModules: { modules: [{ pieces: products }] } } },
    page: '/e/[...landingSlug]',
  })}</script></body></html>`
}

function product(input: {
  code: string
  title: string
  salePrice: number
  stock?: string[]
  seller?: string
  brand?: string
}) {
  return {
    __typename: 'Product',
    code: input.code,
    title: input.title,
    slug: input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    brand: { name: input.brand || 'Logitech' },
    pricingWithNetPrice: { listPrice: input.salePrice * 1.2, salePrice: input.salePrice, netPrice: input.salePrice / 1.21 },
    stock: { labels: input.stock ?? ['HOME_DELIVERY_IN_24_HOURS'] },
    seller: { commercialName: input.seller || 'Fravega' },
    categorization: [[{ name: 'Mouses' }, { name: 'Informática' }]],
  }
}

describe('Fravega structured landing fallback', () => {
  beforeEach(() => resetFravegaLandingCacheForTests())

  it('extracts in-stock structured Product evidence using salePrice', () => {
    const candidates = parseFravegaLandingCandidates(html([
      product({ code: '597172', title: 'Mouse Inalámbrico Logitech M170 Black', salePrice: 13999 }),
    ]))

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      id: 'fravega:597172:Fravega',
      title: 'Mouse Inalámbrico Logitech M170 Black',
      priceArs: 13999,
      condition: 'new',
    })
    expect(candidates[0]?.attributes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Marca', value_name: 'Logitech' }),
      expect.objectContaining({ name: 'Categoría', value_name: expect.stringContaining('Mouses') }),
    ]))
  })

  it('fails closed on missing stock, zero price, malformed Next data, and oversized HTML', () => {
    expect(parseFravegaLandingCandidates(html([
      product({ code: 'nostock', title: 'Mouse Logitech M170', salePrice: 13999, stock: [] }),
      product({ code: 'free', title: 'Mouse Logitech M170', salePrice: 0 }),
    ]))).toEqual([])
    expect(parseFravegaLandingCandidates('<html>no next data</html>')).toEqual([])
    expect(parseFravegaLandingCandidates('x'.repeat(3_000_001))).toEqual([])
  })

  it('deduplicates repeated Product objects by code', () => {
    const repeated = product({ code: '597172', title: 'Mouse Inalámbrico Logitech M170 Black', salePrice: 13999 })
    const candidates = parseFravegaLandingCandidates(html([repeated, repeated]))
    expect(candidates).toHaveLength(1)
  })

  it('uses a short-lived in-isolate cache so repeated benchmarks do not re-download the large landing', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(html([
      product({ code: '597172', title: 'Mouse Inalámbrico Logitech M170 Black', salePrice: 13999 }),
    ]), { status: 200, headers: { 'content-type': 'text/html' } }))

    const first = await discoverFravegaLanding(fetchImpl, { now: 1_000_000, ttlMs: 60_000 })
    const second = await discoverFravegaLanding(fetchImpl, { now: 1_010_000, ttlMs: 60_000 })

    expect(first.candidates).toHaveLength(1)
    expect(second.candidates).toHaveLength(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(second.warnings.join(' ')).toContain('cache')
  })

  it('does not cache an unavailable or malformed landing response', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('blocked', { status: 403 }))
      .mockResolvedValueOnce(new Response(html([
        product({ code: '597172', title: 'Mouse Inalámbrico Logitech M170 Black', salePrice: 13999 }),
      ]), { status: 200 }))

    const first = await discoverFravegaLanding(fetchImpl, { now: 1_000_000 })
    const second = await discoverFravegaLanding(fetchImpl, { now: 1_000_100 })

    expect(first.candidates).toHaveLength(0)
    expect(second.candidates).toHaveLength(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
