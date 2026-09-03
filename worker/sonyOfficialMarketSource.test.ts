import { describe, expect, it, vi } from 'vitest'
import {
  createArgentinaDirectRetailerProvider,
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
    productName: 'Auriculares Inalámbricos Sony WH-1000XM5 con Noise Cancelling',
    brand: 'Sony',
    linkText: `auriculares-wh-1000xm5-${color.toLowerCase()}`,
    productReference: 'WH-1000XM5',
    properties: [
      { name: 'Modelo', values: ['WH-1000XM5'] },
      { name: 'Color', values: [color] },
    ],
    items: [{
      itemId,
      name: `WH-1000XM5 ${color}`,
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

  it('uses Sony public VTEX evidence without credentials and reports Sony only when it contributes', async () => {
    const sonyProducts = [
      sonyXm5Product('xm5-black', 'Negro', 899999),
      sonyXm5Product('xm5-silver', 'Plata', 909999),
      sonyXm5Product('xm5-blue', 'Azul', 919999),
      sonyXm5Product('xm5-pink', 'Rosa', 929999),
      sonyXm5Product('xm5-smoky-pink', 'Rosa humo', 939999),
    ]

    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('store.sony.com.ar/api/io/_v/api/intelligent-search/')) {
        return json({ products: sonyProducts })
      }
      return json({}, 404)
    })

    const result = await createArgentinaDirectRetailerProvider({ fetchImpl }).discover({
      query: 'sony wh-1000xm5',
      productName: 'Sony WH-1000XM5',
      category: 'auriculares bluetooth',
    })

    expect(result.candidates).toHaveLength(5)
    expect(result.sourceLabel).toBe('Retailers argentinos directos · Sony Store Oficial')
    expect(result.candidates.every((candidate) => candidate.id.startsWith('sony-official:'))).toBe(true)
    expect(result.candidates.every((candidate) => candidate.priceArs > 0)).toBe(true)
    expect(result.candidates.every((candidate) => candidate.attributes?.some((attribute) => attribute.value_name?.includes('WH-1000XM5')))).toBe(true)
    expect(fetchImpl.mock.calls.every(([, init]) => !(init?.headers as any)?.authorization)).toBe(true)
  })
})
