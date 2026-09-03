import { describe, expect, it, vi } from 'vitest'
import { createGoogleShoppingArgentinaProvider, extractMercadoLibreItemId } from './googleShoppingMarketProvider'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('Google Shopping Argentina discovery adapter', () => {
  it('localizes discovery to Argentina and maps shopping + inline results', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input))
      expect(url.origin + url.pathname).toBe('https://serpapi.com/search.json')
      expect(url.searchParams.get('engine')).toBe('google_shopping')
      expect(url.searchParams.get('gl')).toBe('ar')
      expect(url.searchParams.get('hl')).toBe('es')
      expect(url.searchParams.get('google_domain')).toBe('google.com.ar')
      expect(url.searchParams.get('location')).toBe('Buenos Aires, Buenos Aires, Argentina')
      expect(url.searchParams.get('api_key')).toBe('test-serp-key')
      return json({
        shopping_results: [{
          position: 1,
          title: 'Logitech MX Master 3S Mouse Inalámbrico',
          price: '$ 145.000',
          extracted_price: 145000,
          link: 'https://tienda.example.com.ar/mx-master-3s',
          source: 'Tienda Argentina',
          product_id: 'google-1',
        }],
        inline_shopping_results: [{
          position: 2,
          title: 'Logitech MX Master 3S Graphite',
          price: '$ 149.990',
          extracted_price: 149990,
          link: 'https://articulo.mercadolibre.com.ar/MLA-1234567890-logitech-mx-master-3s-_JM',
          source: 'Mercado Libre',
        }],
      })
    })

    const provider = createGoogleShoppingArgentinaProvider({ apiKey: 'test-serp-key', fetchImpl })
    const result = await provider.discover({
      query: 'Logitech MX Master 3S',
      productName: 'Logitech MX Master 3S',
      category: 'mouse',
    })

    expect(result.providerId).toBe('google-shopping-argentina')
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates[0].id).toBe('google-shopping:google-1')
    expect(result.candidates[0].priceArs).toBe(145000)
    expect(result.candidates[1].id).toBe('MLA1234567890')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects explicitly foreign-currency prices instead of treating them as ARS', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({
      shopping_results: [
        { title: 'Producto local', price: '$ 90.000', extracted_price: 90000, product_id: 'local' },
        { title: 'Producto USD', price: 'US$ 120', extracted_price: 120, product_id: 'usd' },
        { title: 'Producto USD 2', price: 'USD 150', extracted_price: 150, product_id: 'usd2' },
      ],
    }))
    const provider = createGoogleShoppingArgentinaProvider({ apiKey: 'x', fetchImpl })
    const result = await provider.discover({ query: 'producto', productName: 'producto', category: '' })

    expect(result.candidates.map((item) => item.id)).toEqual(['google-shopping:local'])
    expect(result.warnings?.join(' ')).toContain('2 shopping result(s) rejected')
  })

  it('rejects bare-number / signless prices instead of assuming ARS', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({
      shopping_results: [
        { title: 'Producto con signo', price: '$ 90.000', extracted_price: 90000, product_id: 'ars' },
        { title: 'Producto sin signo', price: '150', extracted_price: 150, product_id: 'bare' },
        { title: 'Producto sin price string', extracted_price: 200, product_id: 'nostring' },
      ],
    }))
    const provider = createGoogleShoppingArgentinaProvider({ apiKey: 'x', fetchImpl })
    const result = await provider.discover({ query: 'producto', productName: 'producto', category: '' })
    expect(result.candidates.map((item) => item.id)).toEqual(['google-shopping:ars'])
  })

  it('marks used/refurbished shopping results so the matcher can reject them', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({
      shopping_results: [
        { title: 'iPhone 15 Pro 256GB', price: '$ 2.000.000', extracted_price: 2000000, product_id: 'used', second_hand_condition: 'Used' },
        { title: 'iPhone 15 Pro 256GB', price: '$ 2.100.000', extracted_price: 2100000, product_id: 'refurb', extensions: ['Reacondicionado'] },
      ],
    }))
    const provider = createGoogleShoppingArgentinaProvider({ apiKey: 'x', fetchImpl })
    const result = await provider.discover({ query: 'iphone', productName: 'iphone', category: 'phone' })

    expect(result.candidates.every((item) => item.condition === 'used')).toBe(true)
  })

  it('extracts only Mercado Libre item ids that are safe for sale_price resolution', () => {
    expect(extractMercadoLibreItemId('https://articulo.mercadolibre.com.ar/MLA-1432123456-title-_JM')).toBe('MLA1432123456')
    expect(extractMercadoLibreItemId('https://www.mercadolibre.com.ar/producto/p/MLA1234')).toBeNull()
    expect(extractMercadoLibreItemId('https://example.com/product/123')).toBeNull()
  })

  it('fails closed on provider HTTP errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ error: 'rate limited' }, 429))
    const provider = createGoogleShoppingArgentinaProvider({ apiKey: 'x', fetchImpl })
    await expect(provider.discover({ query: 'mouse', productName: 'mouse', category: '' }))
      .rejects.toThrow('Google Shopping discovery HTTP 429')
  })

  it('fails closed when SerpApi reports an application-level error', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ error: 'Your account has insufficient credits.' }))
    const provider = createGoogleShoppingArgentinaProvider({ apiKey: 'x', fetchImpl })
    await expect(provider.discover({ query: 'mouse', productName: 'mouse', category: '' }))
      .rejects.toThrow('Google Shopping discovery unavailable')
  })
})
