import { afterEach, describe, expect, it, vi } from 'vitest'
import { readAlibabaProduct, type ProductAnalysis } from './productAnalysis'
import { enrichProductAnalysisV2 } from './productAnalysisV2'

function baseAnalysis(): ProductAnalysis {
  return {
    sourceUrl: 'manual://product',
    fetched: false,
    product: {
      name: 'Termo de acero inoxidable 1 litro',
      category: 'Botella térmica',
      unitPriceUsd: 8,
      moq: 20,
      packedWeightKg: 0.6,
      volumeCbm: 0.004,
      originCountry: 'China',
      imageUrl: null,
      material: 'acero inoxidable',
      functionText: 'conservar bebidas frías o calientes',
      description: 'recipiente isotérmico de doble pared',
    },
    market: { estimatedPriceArs: null, estimatedMonthlyDemand: 0, source: 'pendiente' },
    suggestedQuantities: [20, 40],
    confidence: { overall: 70, productSource: 'user', logistics: 'confirmed', market: 'pending' },
    assumptions: [],
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('product intake versus paid analysis credit boundary', () => {
  it('reads an Alibaba ficha through the zero-credit product-read endpoint', async () => {
    const fetchMock = vi.fn(async () => Response.json(baseAnalysis()))
    vi.stubGlobal('fetch', fetchMock)

    await readAlibabaProduct('https://www.alibaba.com/product-detail/123.html')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/product-read')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).has('idempotency-key')).toBe(false)
  })

  it('reserves one paid analysis only when NCM/economics actually start', async () => {
    const paid = baseAnalysis()
    paid.market = { estimatedPriceArs: 40000, estimatedMonthlyDemand: 0, source: 'live' }
    paid.fx = {
      status: 'live', arsPerUsd: 1500, sourceDate: '2026-09-03', source: 'BCRA', code: 'REF', note: 'test',
    }

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/analyze') {
        return new Response(JSON.stringify(paid), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-shippingapp-usage-reservation': 'reservation-123',
          },
        })
      }
      if (String(input) === '/api/ncm-classify') {
        return Response.json({
          status: 'candidate',
          code: '9617.00.10',
          label: 'Termos y demás recipientes isotérmicos',
          confidence: 'medium',
          alternatives: [],
          missingFacts: [],
          rationale: ['test'],
          searchTerms: ['termo', 'isotérmico'],
          sourceDate: '2026-08-14',
          source: 'test',
          catalogRecordCount: 10000,
          retrievalMode: 'deterministic_fallback',
          tariff: {
            aecPct: 18, diePct: 18, tePct: 3, diiPct: 0, vatPct: 21,
            vatAdditionalPct: 20, gainsPct: 6, iibbPct: 2.5,
            internalTax: null, capitalGoodEligible: false,
          },
          sim: null,
          refinement: { allowed: false, attempt: 1, maxAttempts: 3 },
        })
      }
      return Response.json({ error: 'unexpected endpoint' }, { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await enrichProductAnalysisV2(baseAnalysis())

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual(['/api/analyze', '/api/ncm-classify'])
    const analyzeHeaders = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers)
    expect(analyzeHeaders.get('idempotency-key')).toMatch(/^op-/)
    const ncmHeaders = new Headers((fetchMock.mock.calls[1][1] as RequestInit).headers)
    expect(ncmHeaders.get('x-shippingapp-usage-reservation')).toBe('reservation-123')
    expect(result.customs.ncmCandidate).toBe('9617.00.10')
  })

  it('stops at the paid boundary with a useful message when no analyses remain', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/analyze') {
        return Response.json({
          error: 'No te quedan créditos disponibles en este período.',
          code: 'usage_exhausted',
        }, { status: 402 })
      }
      return Response.json({ error: 'NCM should not run' }, { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(enrichProductAnalysisV2(baseAnalysis())).rejects.toThrow(
      'Tu producto está listo. Para clasificar la NCM y calcular el costo puesto necesitás 1 análisis disponible.',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/analyze')
  })
})
