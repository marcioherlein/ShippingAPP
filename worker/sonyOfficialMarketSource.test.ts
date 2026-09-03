import { describe, expect, it, vi } from 'vitest'
import { runArgentinaMarketBenchmark } from './marketBenchmarkEngine'
import {
  createArgentinaDirectRetailerProvider,
  normalizeSonyOfficialIdentityText,
  SPECIALIZED_ARGENTINA_VTEX_RETAILERS,
} from './vtexRetailerMarketProvider'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function sonyXm5Product(itemId: string, color: string, price: number) {
  return {
    productId: `sony-${itemId}`,
    // Mirror the public Sony VTEX shape: the product name is generic and the
    // compact model code is carried by item/reference values without a hyphen.
    productName: 'Auriculares inalámbricos con noise cancelling',
    brand: 'Sony',
    linkText: `wh-1000xm5-${color.toLowerCase()}`,
    productReference: 'WH1000XM5/LMUC',
    properties: [
      { name: 'Modelo', values: ['WH1000XM5/LMUC'] },
      { name: 'Color', values: [color] },
    ],
    items: [{
      itemId,
      name: `WH1000XM5/LMUC ${color}`,
      sellers: [{
        sellerId: '1',
        sellerName: 'Sony Store Oficial',
        commertialOffer: {
          Price: price,
          ListPrice: price,
          AvailableQuantity: 3,
        },
      }],
    }],
  }
}

describe('Sony Store Oficial Argentina market source', () => {
  it('keeps Sony as an explicit bounded specialized public VTEX source', () => {
    expect(SPECIALIZED_ARGENTINA_VTEX_RETAILERS).toEqual([
      expect.objectContaining({
        id: 'sony-official',
        name: 'Sony Store Oficial',
        baseUrl: 'https://store.sony.com.ar',
        tradePolicy: '1',
        maxCandidates: 12,
      }),
    ])
  })

  it('normalizes compact Sony model codes without collapsing WH and WF families', () => {
    expect(normalizeSonyOfficialIdentityText('WH1000XM5/LMUC')).toContain('WH-1000XM5')
    expect(normalizeSonyOfficialIdentityText('WF1000XM5/BMUC')).toContain('WF-1000XM5')
    expect(normalizeSonyOfficialIdentityText('WF1000XM5/BMUC')).not.toContain('WH-1000XM5')
  })

  it('uses real-shaped Sony public VTEX evidence without credentials', async () => {
    const sonyProducts = [
      sonyXm5Product('3581', 'Negro', 449999),
      sonyXm5Product('3580', 'Plata', 449999),
      sonyXm5Product('3579', 'Azul', 449999),
      sonyXm5Product('2902', 'Negro', 549999),
      sonyXm5Product('2610', 'Plata', 549999),
      sonyXm5Product('2611', 'Azul', 549999),
    ]

    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('store.sony.com.ar/api/io/_v/api/intelligent-search/')) {
        return json({ products: sonyProducts })
      }
      return json({}, 404)
    })

    const provider = createArgentinaDirectRetailerProvider({
      fetchImpl,
      retailers: [...SPECIALIZED_ARGENTINA_VTEX_RETAILERS],
    })
    const discovery = await provider.discover({
      query: 'sony wh-1000xm5',
      productName: 'Sony WH-1000XM5',
      category: 'auriculares bluetooth',
    })

    expect(discovery.candidates).toHaveLength(6)
    expect(discovery.sourceLabel).toBe('Retailers argentinos directos · Sony Store Oficial')
    expect(discovery.candidates.every((candidate) => candidate.id.startsWith('sony-official:'))).toBe(true)
    expect(discovery.candidates.every((candidate) => candidate.title.includes('WH-1000XM5'))).toBe(true)
    expect(discovery.candidates.every((candidate) => candidate.attributes?.some((attribute) => attribute.value_name?.includes('WH-1000XM5')))).toBe(true)
    expect(fetchImpl.mock.calls.every(([, init]) => !(init?.headers as any)?.authorization)).toBe(true)

    const benchmark = await runArgentinaMarketBenchmark(
      'Sony WH-1000XM5',
      'auriculares bluetooth',
      provider,
    )
    expect(benchmark.matchMode).toBe('exact')
    expect(benchmark.status).toBe('live')
    expect(benchmark.comparableCount).toBeGreaterThanOrEqual(5)
    expect(benchmark.comparables.every((candidate) => candidate.title.includes('WH-1000XM5'))).toBe(true)
  })
})
