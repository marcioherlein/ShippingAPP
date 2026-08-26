import { describe, expect, it } from 'vitest'
import { hotProducts } from '../data/hotProducts'
import { dedupeHotProducts, getCachedHotProducts, hotProductToQuotePrefill, normalizeAlibabaProductUrl, normalizeProductImageUrl, proxiedImageUrl } from './hotProducts'

describe('cached hot products', () => {
  it('returns unique cached products without runtime calls', () => {
    const products = getCachedHotProducts(12)
    const ids = new Set(products.map((product) => product.id))
    expect(products.length).toBeGreaterThan(0)
    expect(ids.size).toBe(products.length)
    expect(products.every((product) => product.cachedFrom === 'static_seed')).toBe(true)
    expect(products.every((product) => product.productUrl.startsWith('https://'))).toBe(true)
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

  it('keeps Alibaba links and falls back to Alibaba search for invalid links', () => {
    expect(normalizeAlibabaProductUrl('https://www.alibaba.com/product-detail/test_123.html', 'padel')).toContain('alibaba.com/product-detail')
    expect(normalizeAlibabaProductUrl('https://evil.example/padel', 'padel racket')).toBe('https://www.alibaba.com/trade/search?SearchText=padel%20racket')
  })

  it('accepts only allowed image hosts and generates proxy URLs', () => {
    expect(normalizeProductImageUrl('https://images.unsplash.com/photo-test')).toBe('https://images.unsplash.com/photo-test')
    expect(normalizeProductImageUrl('https://s.alicdn.com/@sc04/kf/test.jpg')).toBe('https://s.alicdn.com/@sc04/kf/test.jpg')
    expect(normalizeProductImageUrl('https://evil.example/test.jpg')).toBeNull()
    expect(proxiedImageUrl('https://images.unsplash.com/photo-test')).toBe('/api/image-proxy?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-test')
  })
})
