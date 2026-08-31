import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeArgentinaMarket } from './catalogProvider'

function mlJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function isSearchEndpoint(url: string) {
  return url.includes('/sites/MLA/domain_discovery/search') || url.includes('/sites/MLA/search')
}

function catalogId(index: number) {
  return `MLA18500${String(index).padStart(3, '0')}`
}

function itemId(index: number) {
  return `MLA31000${String(index).padStart(3, '0')}`
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Mercado Libre catalog fallback hydration', () => {
  it('recovers a live benchmark from official product details when listing search is blocked', async () => {
    const catalogResults = Array.from({ length: 6 }, (_, index) => ({
      id: catalogId(index + 1),
      status: 'active',
      domain_id: 'MLA-PADEL_RACKETS',
      name: `Paleta Padel Carbono EVA Pro ${index + 1}`,
    }))

    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (isSearchEndpoint(url)) return mlJson({ message: 'forbidden' }, 403)
      if (url.includes('/products/search')) {
        expect((init?.headers as any)?.authorization).toBe('Bearer test-token')
        return mlJson({ paging: { total: catalogResults.length }, results: catalogResults })
      }
      const productMatch = url.match(/\/products\/(MLA\d+)$/)
      if (productMatch) {
        const index = Number(productMatch[1].slice(-3))
        return mlJson({
          id: productMatch[1],
          status: 'active',
          domain_id: 'MLA-PADEL_RACKETS',
          name: `Paleta Padel Carbono EVA Pro ${index}`,
          permalink: `https://www.mercadolibre.com.ar/p/${productMatch[1]}`,
          attributes: [],
          buy_box_winner: {
            item_id: itemId(index),
            category_id: 'MLA1276',
            seller_id: 7000 + index,
            price: 120000 + index * 2000,
            currency_id: 'ARS',
          },
        })
      }
      const saleMatch = url.match(/\/items\/(MLA\d+)\/sale_price/)
      if (saleMatch) {
        const index = Number(saleMatch[1].slice(-3))
        return mlJson({ amount: 115000 + index * 2000, currency_id: 'ARS' })
      }
      return mlJson({ message: 'not found' }, 404)
    })

    const result = await analyzeArgentinaMarket('Paleta de pádel carbono EVA', 'Padel racket', {
      accessToken: 'test-token',
      fetchImpl,
    })

    expect(result.status).toBe('live')
    expect(result.rawCount).toBe(6)
    expect(result.comparableCount).toBeGreaterThanOrEqual(5)
    expect(result.effectivePriceCount).toBeGreaterThanOrEqual(5)
    expect(result.suggestedPriceArs).toBeGreaterThan(0)
    expect(result.source).toContain('catalog product-detail fallback')
    expect(result.priceQuality).toBe('effective_sale_price')
    expect(result.comparables.every((item) => item.id.startsWith('MLA31000'))).toBe(true)
    expect(result.comparables.every((item) => item.priceSource === 'sale_price')).toBe(true)
    expect(result.warnings.join(' ')).toContain('buy-box item with an ARS price')
    expect(JSON.stringify(result)).not.toContain('test-token')
  })

  it('fails closed when catalog products have no buyable winner instead of treating catalog ids as item ids', async () => {
    const catalogResults = Array.from({ length: 7 }, (_, index) => ({
      id: catalogId(index + 1),
      status: 'active',
      domain_id: 'MLA-MOUSES',
      name: `Mouse Inalambrico Ergonomico ${index + 1}`,
    }))
    let salePriceCalls = 0

    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (isSearchEndpoint(url)) return mlJson({ message: 'forbidden' }, 403)
      if (url.includes('/products/search')) return mlJson({ paging: { total: catalogResults.length }, results: catalogResults })
      if (/\/products\/MLA\d+$/.test(url)) {
        const id = url.split('/').at(-1)
        return mlJson({
          id,
          status: 'active',
          domain_id: 'MLA-MOUSES',
          name: 'Mouse Inalambrico Ergonomico',
          buy_box_winner: null,
        })
      }
      if (url.includes('/sale_price')) {
        salePriceCalls += 1
        return mlJson({ amount: 999999, currency_id: 'ARS' })
      }
      return mlJson({ message: 'not found' }, 404)
    })

    const result = await analyzeArgentinaMarket('Mouse inalámbrico', 'Mouse', {
      accessToken: 'test-token',
      fetchImpl,
    })

    expect(result.status).toBe('insufficient')
    expect(result.rawCount).toBe(0)
    expect(result.comparableCount).toBe(0)
    expect(result.suggestedPriceArs).toBeNull()
    expect(salePriceCalls).toBe(0)
    expect(result.warnings.join(' ')).toContain('0 exposed a buy-box item with an ARS price')
  })

  it('skips failed or unsafe product details while retaining five valid comparables', async () => {
    const catalogResults = Array.from({ length: 8 }, (_, index) => ({
      id: catalogId(index + 1),
      status: 'active',
      domain_id: 'MLA-PADEL_RACKETS',
      name: `Paleta Padel Carbono EVA Pro ${index + 1}`,
    }))

    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (isSearchEndpoint(url)) return mlJson({ message: 'forbidden' }, 403)
      if (url.includes('/products/search')) return mlJson({ paging: { total: catalogResults.length }, results: catalogResults })
      const productMatch = url.match(/\/products\/(MLA\d+)$/)
      if (productMatch) {
        const index = Number(productMatch[1].slice(-3))
        if (index === 6) return mlJson({ message: 'temporary failure' }, 503)
        if (index === 7) {
          return mlJson({
            id: productMatch[1],
            name: `Paleta Padel Carbono EVA Pro ${index}`,
            buy_box_winner: { item_id: 'CATALOG-NOT-ITEM', price: 129000, currency_id: 'ARS' },
          })
        }
        if (index === 8) {
          return mlJson({
            id: productMatch[1],
            name: `Paleta Padel Carbono EVA Pro ${index}`,
            buy_box_winner: { item_id: itemId(index), price: 99, currency_id: 'USD' },
          })
        }
        return mlJson({
          id: productMatch[1],
          status: 'active',
          domain_id: 'MLA-PADEL_RACKETS',
          name: `Paleta Padel Carbono EVA Pro ${index}`,
          attributes: [],
          buy_box_winner: {
            item_id: itemId(index),
            category_id: 'MLA1276',
            seller_id: 8100 + index,
            price: 120000 + index * 1000,
            currency_id: 'ARS',
          },
        })
      }
      const saleMatch = url.match(/\/items\/(MLA\d+)\/sale_price/)
      if (saleMatch) {
        const index = Number(saleMatch[1].slice(-3))
        return mlJson({ amount: 118000 + index * 1000, currency_id: 'ARS' })
      }
      return mlJson({ message: 'not found' }, 404)
    })

    const result = await analyzeArgentinaMarket('Paleta de pádel carbono EVA', 'Padel racket', {
      accessToken: 'test-token',
      fetchImpl,
    })

    expect(result.status).toBe('live')
    expect(result.rawCount).toBe(5)
    expect(result.comparableCount).toBe(5)
    expect(result.effectivePriceCount).toBe(5)
    expect(result.warnings.join(' ')).toContain('1 MercadoLibre catalog product-detail request(s) failed and were skipped')
    expect(result.comparables.some((item) => item.id === 'CATALOG-NOT-ITEM')).toBe(false)
  })

  it('bounds catalog product-detail fan-out to twelve requests', async () => {
    const catalogResults = Array.from({ length: 20 }, (_, index) => ({
      id: catalogId(index + 1),
      status: 'active',
      domain_id: 'MLA-MOUSES',
      name: `Mouse Inalambrico Gaming ${index + 1}`,
    }))
    let detailCalls = 0

    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (isSearchEndpoint(url)) return mlJson({ message: 'forbidden' }, 403)
      if (url.includes('/products/search')) return mlJson({ paging: { total: catalogResults.length }, results: catalogResults })
      const productMatch = url.match(/\/products\/(MLA\d+)$/)
      if (productMatch) {
        detailCalls += 1
        const index = Number(productMatch[1].slice(-3))
        return mlJson({
          id: productMatch[1],
          domain_id: 'MLA-MOUSES',
          name: `Mouse Inalambrico Gaming ${index}`,
          buy_box_winner: {
            item_id: itemId(index),
            category_id: 'MLA1714',
            seller_id: 9000 + index,
            price: 45000 + index * 500,
            currency_id: 'ARS',
          },
        })
      }
      if (url.includes('/sale_price')) return mlJson({ amount: 50000, currency_id: 'ARS' })
      return mlJson({ message: 'not found' }, 404)
    })

    const result = await analyzeArgentinaMarket('Mouse inalámbrico gaming', 'Mouse', {
      accessToken: 'test-token',
      fetchImpl,
      salePriceLookupLimit: 0,
    })

    expect(detailCalls).toBe(12)
    expect(result.rawCount).toBeLessThanOrEqual(12)
    expect(result.warnings.join(' ')).toContain('bounded to 12 products')
  })
})
