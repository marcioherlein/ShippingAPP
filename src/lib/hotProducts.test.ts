import { describe, expect, it } from 'vitest'
import { hotProducts } from '../data/hotProducts'
import { dedupeHotProducts, getCachedHotProducts, hotProductToQuotePrefill } from './hotProducts'

describe('cached hot products', () => {
  it('returns unique cached products without runtime calls', () => {
    const products = getCachedHotProducts(12)
    const ids = new Set(products.map((product) => product.id))
    expect(products.length).toBeGreaterThan(0)
    expect(ids.size).toBe(products.length)
    expect(products.every((product) => product.cachedFrom === 'static_seed')).toBe(true)
  })

  it('dedupes repeated products by id', () => {
    const duplicated = [hotProducts[0], hotProducts[0], hotProducts[1]]
    expect(dedupeHotProducts(duplicated).map((product) => product.id)).toEqual([hotProducts[0].id, hotProducts[1].id])
  })

  it('maps a hot product to manual quote prefill fields', () => {
    const prefill = hotProductToQuotePrefill(hotProducts[0])
    expect(prefill.productName).toBe(hotProducts[0].title)
    expect(prefill.quantity).toBe(hotProducts[0].moq)
    expect(prefill.unitPriceUsd).toBe(hotProducts[0].unitPriceUsd)
    expect(prefill.sourceLabel).toBe('Hot product cacheado')
  })
})
