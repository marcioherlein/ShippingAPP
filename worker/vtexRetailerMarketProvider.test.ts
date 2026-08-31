import { describe, expect, it, vi } from 'vitest'
import {
  createArgentinaDirectRetailerProvider,
  DEFAULT_ARGENTINA_VTEX_RETAILERS,
  type ArgentinaVtexRetailer,
} from './vtexRetailerMarketProvider'

const BASE_RETAILERS: ArgentinaVtexRetailer[] = [
  { id: 'fravega', name: 'Frávega', baseUrl: 'https://www.fravega.com' },
  { id: 'cetrogar', name: 'Cetrogar', baseUrl: 'https://www.cetrogar.com.ar' },
]

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function product(input: {
  productId?: string
  productName: string
  itemId: string
  sellerId?: string
  sellerName?: string
  price: number
  stock?: number
  model?: string
}) {
  return {
    productId: input.productId || input.itemId,
    productName: input.productName,
    brand: input.productName.split(' ')[0],
    linkText: input.productName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    productReference: input.model,
    properties: input.model ? [{ name: 'Modelo', values: [input.model] }] : [],
    items: [{
      itemId: input.itemId,
      name: input.productName,
      sellers: [{
        sellerId: input.sellerId || '1',
        sellerName: input.sellerName || 'Seller',
        commertialOffer: {
          Price: input.price,
          ListPrice: input.price * 1.1,
          AvailableQuantity: input.stock ?? 10,
        },
      }],
    }],
  }
}

describe('Argentina direct VTEX retailer discovery', () => {
  it('keeps the default free-retailer registry explicit and bounded', () => {
    expect(DEFAULT_ARGENTINA_VTEX_RETAILERS.map((retailer) => retailer.id)).toEqual([
      'fravega',
      'cetrogar',
      'naldo',
      'oncity',
      'megatone',
    ])
    expect(DEFAULT_ARGENTINA_VTEX_RETAILERS.every((retailer) => retailer.baseUrl.startsWith('https://'))).toBe(true)
    expect(DEFAULT_ARGENTINA_VTEX_RETAILERS.every((retailer) => (retailer.maxCandidates || 0) <= 12)).toBe(true)
  })

  it('aggregates the five public retailer catalogs without credentials and reports only contributors', async () => {
    const expected = new Map([
      ['fravega.com', ['fra', 'Frávega', 149999]],
      ['cetrogar.com.ar', ['cet', 'Cetrogar', 152000]],
      ['naldo.com.ar', ['nal', 'Naldo', 151000]],
      ['oncity.com', ['onc', 'OnCity', 153000]],
      ['megatone.net', ['meg', 'Megatone', 154000]],
    ] as const)
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      for (const [host, [prefix, name, price]] of expected) {
        if (url.includes(host)) {
          return json({ products: [product({
            productName: 'Logitech MX Master 3S',
            itemId: `${prefix}-1`,
            sellerName: name,
            price,
            model: 'MX Master 3S',
          })] })
        }
      }
      return json({}, 404)
    })

    const provider = createArgentinaDirectRetailerProvider({ fetchImpl })
    const result = await provider.discover({ query: 'Logitech MX Master 3S', productName: 'Logitech MX Master 3S', category: 'mouse' })

    expect(result.candidates).toHaveLength(5)
    for (const name of ['Frávega', 'Cetrogar', 'Naldo', 'OnCity', 'Megatone']) {
      expect(result.sourceLabel).toContain(name)
      expect(result.candidates.some((candidate) => candidate.sellerKey?.startsWith(`${name}:`))).toBe(true)
    }
    expect(result.candidates.every((candidate) => candidate.priceArs > 0)).toBe(true)
    expect(fetchImpl.mock.calls.every(([, init]) => !(init?.headers as any)?.authorization)).toBe(true)
  })

  it('does not claim a retailer in the source label when it returned no candidate evidence', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('fravega.com')) return json({ products: [product({ productName: 'Logitech MX Master 3S', itemId: 'fra-1', price: 150000 })] })
      if (url.includes('/api/io/_v/api/intelligent-search/')) return json({ products: [] })
      return json([])
    })

    const result = await createArgentinaDirectRetailerProvider({ fetchImpl }).discover({
      query: 'Logitech MX Master 3S',
      productName: 'Logitech MX Master 3S',
      category: 'mouse',
    })

    expect(result.sourceLabel).toBe('Retailers argentinos directos · Frávega')
    expect(result.candidates).toHaveLength(1)
  })

  it('rejects zero-price and out-of-stock offers before matching', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const host = String(input).includes('fravega.com') ? 'fra' : 'cet'
      return json({ products: [
        product({ productName: 'Bosch GSB 13 RE 650W', itemId: `${host}-ok`, price: 125000, stock: 2 }),
        product({ productName: 'Bosch GSB 13 RE 650W', itemId: `${host}-zero`, price: 0, stock: 3 }),
        product({ productName: 'Bosch GSB 13 RE 650W', itemId: `${host}-nostock`, price: 119000, stock: 0 }),
      ] })
    })

    const result = await createArgentinaDirectRetailerProvider({ fetchImpl, retailers: BASE_RETAILERS }).discover({
      query: 'Bosch GSB 13 RE 650W',
      productName: 'Bosch GSB 13 RE 650W',
      category: 'taladro',
    })

    expect(result.candidates).toHaveLength(2)
    expect(result.candidates.every((candidate) => candidate.id.endsWith('-ok:1'))).toBe(true)
  })

  it('falls back to VTEX legacy public search when Intelligent Search is unavailable', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/api/io/_v/api/intelligent-search/')) return json({}, 404)
      if (url.includes('/api/catalog_system/pub/products/search/')) {
        const prefix = url.includes('fravega.com') ? 'fra' : 'cet'
        return json([product({ productName: 'Philips Licuadora 600W', itemId: `${prefix}-legacy`, price: 99000 })])
      }
      return json({}, 404)
    })

    const result = await createArgentinaDirectRetailerProvider({ fetchImpl, retailers: BASE_RETAILERS }).discover({
      query: 'Philips Licuadora 600W',
      productName: 'Philips Licuadora 600W',
      category: 'licuadora',
    })

    expect(result.candidates).toHaveLength(2)
    expect(result.warnings.join(' ')).toContain('legacy public search was attempted')
    expect(fetchImpl.mock.calls.filter(([input]) => String(input).includes('/api/catalog_system/pub/products/search/'))).toHaveLength(2)
  })

  it('fails soft when one retailer is down and preserves evidence from the other', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('fravega.com')) throw new Error('Frávega timeout')
      if (url.includes('cetrogar.com.ar') && url.includes('/api/io/_v/api/intelligent-search/')) {
        return json({ products: [product({ productName: 'Daewoo Hidrolavadora 1400W 110 bar', itemId: 'cet-1', price: 178999 })] })
      }
      return json({}, 404)
    })

    const result = await createArgentinaDirectRetailerProvider({ fetchImpl, retailers: BASE_RETAILERS, requestTimeoutMs: 1000 }).discover({
      query: 'Daewoo Hidrolavadora 1400W 110 bar',
      productName: 'Daewoo Hidrolavadora 1400W 110 bar',
      category: 'hidrolavadora',
    })

    expect(result.candidates).toHaveLength(1)
    expect(result.sourceLabel).toContain('Cetrogar')
    expect(result.sourceLabel).not.toContain('Frávega')
    expect(result.warnings.join(' ')).toContain('Frávega')
  })

  it('never accepts a provider link that escapes the configured retailer hostname', async () => {
    const malicious = product({ productName: 'Logitech MX Master 3S', itemId: 'fra-1', price: 150000 }) as any
    malicious.link = 'https://evil.example/steal'
    malicious.linkText = 'logitech-mx-master-3s'
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ products: [malicious] }))

    const result = await createArgentinaDirectRetailerProvider({
      fetchImpl,
      retailers: [{ id: 'fravega', name: 'Frávega', baseUrl: 'https://www.fravega.com' }],
    }).discover({ query: 'Logitech MX Master 3S', productName: 'Logitech MX Master 3S', category: 'mouse' })

    expect(result.candidates[0]?.permalink).toBe('https://www.fravega.com/logitech-mx-master-3s/p')
    expect(result.candidates[0]?.permalink).not.toContain('evil.example')
  })
})
