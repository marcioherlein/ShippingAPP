import { describe, expect, it, vi } from 'vitest'
import { createShopifyRetailerMarketProvider } from './shopifyRetailerMarketProvider'

describe('Shopify retailer market provider', () => {
  it('maps only available positive-price products from public predictive search', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      resources: {
        results: {
          products: [
            { id: 1, title: 'Mouse Logitech MX Master 3S', price: '139300.00', available: true, url: '/products/mx-master-3s?_pos=1' },
            { id: 2, title: 'Sold out product', price: '100.00', available: false, url: '/products/sold-out' },
            { id: 3, title: 'Free malformed product', price: '0', available: true, url: '/products/free' },
          ],
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch

    const provider = createShopifyRetailerMarketProvider({
      fetchImpl,
      retailer: {
        id: 'logitech-store-ar',
        name: 'Logitech Store Argentina',
        baseUrl: 'https://www.logitechargentina.com.ar',
      },
    })
    const result = await provider.discover({
      query: 'logitech mx master 3s',
      productName: 'Logitech MX Master 3S',
      category: 'mouse inalambrico',
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/search/suggest.json?')
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]).toMatchObject({
      id: 'logitech-store-ar:1',
      title: 'Mouse Logitech MX Master 3S',
      priceArs: 139300,
      sellerKey: 'Logitech Store Argentina',
      permalink: 'https://www.logitechargentina.com.ar/products/mx-master-3s',
    })
  })

  it('fails closed when the public endpoint is unavailable', async () => {
    const fetchImpl = vi.fn(async () => new Response('blocked', { status: 403 })) as unknown as typeof fetch
    const provider = createShopifyRetailerMarketProvider({
      fetchImpl,
      retailer: { id: 'x', name: 'X', baseUrl: 'https://example.com' },
    })
    await expect(provider.discover({ query: 'mouse', productName: 'mouse', category: 'mouse' }))
      .rejects.toThrow('Shopify suggest returned HTTP 403')
  })
})
