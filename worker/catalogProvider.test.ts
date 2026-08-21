import { describe, expect, it, vi } from 'vitest'
import { analyzeArgentinaMarket } from './catalogProvider'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function marketSearchResults() {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `MLA${index + 1}`,
    title: `Paleta Padel Carbono 12K Profesional ${index + 1}`,
    price: 300000 + index * 10000,
    currency_id: 'ARS',
    condition: 'new',
    category_id: 'MLA123',
    seller: { id: index + 1 },
    permalink: `https://articulo.mercadolibre.com.ar/MLA-${index + 1}`,
  }))
}

describe('Mercado Libre authenticated market benchmark', () => {
  it('fails closed when authentication is not configured', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const result = await analyzeArgentinaMarket('Paleta de padel carbono 12K', 'Padel racket', { fetchImpl })

    expect(result.status).toBe('configuration_required')
    expect(result.suggestedPriceArs).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.warnings.join(' ')).toContain('MERCADOLIBRE_ACCESS_TOKEN')
  })

  it('uses category prediction and effective sale_price for the benchmark', async () => {
    const saleAmounts = [150000, 160000, 170000, 180000, 190000, 200000]
    const calls: Array<{ url: string; authorization: string | null }> = []
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      const headers = new Headers(init?.headers)
      calls.push({ url, authorization: headers.get('authorization') })

      if (url.includes('/domain_discovery/search')) {
        return json([{ category_id: 'MLA123', category_name: 'Paletas de pádel', attributes: [] }])
      }
      if (url.includes('/sites/MLA/search')) {
        expect(url).toContain('category=MLA123')
        return json({ paging: { total: 6 }, results: marketSearchResults() })
      }
      const itemMatch = url.match(/\/items\/MLA(\d+)\/sale_price/)
      if (itemMatch) {
        const index = Number(itemMatch[1]) - 1
        return json({ amount: saleAmounts[index], regular_amount: saleAmounts[index] + 20000, currency_id: 'ARS' })
      }
      return json({ error: 'unexpected' }, 404)
    })

    const result = await analyzeArgentinaMarket('Paleta de padel carbono 12K', 'Padel racket', {
      accessToken: 'test-token',
      fetchImpl,
    })

    expect(result.status).toBe('live')
    expect(result.categoryId).toBe('MLA123')
    expect(result.comparableCount).toBe(6)
    expect(result.effectivePriceCount).toBe(6)
    expect(result.priceQuality).toBe('effective_sale_price')
    expect(result.medianArs).toBe(175000)
    expect(result.suggestedPriceArs).toBe(170000)
    expect(result.comparables.every((item) => item.priceSource === 'sale_price')).toBe(true)
    expect(calls.length).toBe(8)
    expect(calls.every((call) => call.authorization === 'Bearer test-token')).toBe(true)
  })

  it('keeps an authenticated search price only when sale_price cannot be resolved', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/domain_discovery/search')) return json([{ category_id: 'MLA123', category_name: 'Paletas de pádel', attributes: [] }])
      if (url.includes('/sites/MLA/search')) return json({ results: marketSearchResults() })
      if (url.includes('/items/MLA1/sale_price')) return json({ amount: 155000, currency_id: 'ARS' })
      return json({ error: 'price unavailable' }, 503)
    })

    const result = await analyzeArgentinaMarket('Paleta de padel carbono 12K', 'Padel racket', {
      accessToken: 'test-token',
      fetchImpl,
    })

    expect(result.status).toBe('live')
    expect(result.effectivePriceCount).toBe(1)
    expect(result.priceQuality).toBe('mixed_sale_and_search_price')
    expect(result.warnings.join(' ')).toContain('use authenticated search price')
  })
})
