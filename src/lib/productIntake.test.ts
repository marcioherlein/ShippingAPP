import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyIntakeFacts, isAlibabaUrl, runProductIntake } from './productIntake'

afterEach(() => vi.unstubAllGlobals())

describe('product intake client', () => {
  it('accepts only https Alibaba hosts as direct URLs', () => {
    expect(isAlibabaUrl('https://www.alibaba.com/product-detail/test.html')).toBe(true)
    expect(isAlibabaUrl('https://seller.alibaba.com/item/123')).toBe(true)
    expect(isAlibabaUrl('http://www.alibaba.com/product-detail/test.html')).toBe(false)
    expect(isAlibabaUrl('https://alibaba.com.evil.example/product')).toBe(false)
    expect(isAlibabaUrl('not a url')).toBe(false)
  })

  it('keeps a needs-input response partial and does not call customs enrichment', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/intake')
      return new Response(JSON.stringify({
        status: 'needs_input', intent: 'analyze_product', message: '¿Cuál es el MOQ?', searchQuery: null,
        facts: { ...emptyIntakeFacts(), name: 'Product X', category: 'Generic product', unitPriceUsd: 10 },
        factSources: { moq: 'missing', packedWeightKg: 'missing', volumeCbm: 'missing' },
        missingFields: ['MOQ', 'peso embalado por unidad', 'volumen embalado por unidad'], suggestedQuantities: [], assumptions: [],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await runProductIntake('Producto X cuesta USD 10', emptyIntakeFacts())
    expect(result.status).toBe('needs_input')
    expect(result.analysis).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not turn discovery intent into a fake product analysis', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status: 'discovery_pending', intent: 'discover_products', message: 'Discovery pendiente', searchQuery: 'padel rackets',
      facts: emptyIntakeFacts(), factSources: { moq: 'missing', packedWeightKg: 'missing', volumeCbm: 'missing' },
      missingFields: [], suggestedQuantities: [], assumptions: ['no live provider'],
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    const result = await runProductIntake('Buscame paletas', emptyIntakeFacts())
    expect(result.status).toBe('discovery_pending')
    expect(result.analysis).toBeUndefined()
    expect(result.searchQuery).toBe('padel rackets')
  })
})
