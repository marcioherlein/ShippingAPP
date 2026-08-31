import { describe, expect, it } from 'vitest'
import { applyHybridMarketToAnalysis } from './hybridMarketEconomics'
import type { ArgentinaMarketResult } from './marketTypes'
import type { MercadoLibreAuthResult } from './mercadoLibreAuth'

function market(overrides: Partial<ArgentinaMarketResult> = {}): ArgentinaMarketResult {
  return {
    status: 'live',
    query: 'Logitech M170 mouse inalámbrico',
    categoryId: null,
    categoryName: null,
    rawCount: 8,
    comparableCount: 6,
    effectivePriceCount: 0,
    p25Ars: 18000,
    medianArs: 20000,
    p75Ars: 22000,
    suggestedPriceArs: 19500,
    confidence: 82,
    source: 'Retailers argentinos directos · Frávega + Cetrogar',
    priceQuality: 'listed_search_price',
    comparables: Array.from({ length: 6 }, (_, index) => ({
      id: `retailer-${index}`,
      title: `Logitech M170 ${index + 1}`,
      priceArs: 18000 + index * 1000,
      listedPriceArs: 18000 + index * 1000,
      priceSource: 'search_price' as const,
      score: 90,
      reason: 'exact model',
      permalink: `https://retailer.example/p/${index}`,
    })),
    warnings: [],
    ...overrides,
  }
}

const mlUnavailable: MercadoLibreAuthResult = {
  status: 'unavailable',
  accessToken: null,
  source: 'none',
  reason: 'Mercado Libre token storage is unavailable.',
}

const mlReady: MercadoLibreAuthResult = {
  status: 'ready',
  accessToken: 'token',
  source: 'token_store',
}

describe('hybrid market economics overlay', () => {
  it('keeps a live Frávega/Cetrogar benchmark authoritative when Mercado Libre auth is unavailable', () => {
    const result = applyHybridMarketToAnalysis({
      product: { name: 'Logitech M170', category: 'mouse inalámbrico' },
      market: { estimatedPriceArs: null, estimatedMonthlyDemand: 0, source: 'old' },
      confidence: { market: 'pending' },
      assumptions: ['Mercado local bloqueado: falta configurar la autenticación oficial de Mercado Libre.'],
    }, market(), mlUnavailable)

    expect(result.market.estimatedPriceArs).toBe(19500)
    expect(result.market.source).toContain('Frávega + Cetrogar')
    expect(result.market.details.status).toBe('live')
    expect(result.confidence.market).toBe('live-82')
    expect(result.assumptions.join(' ')).not.toContain('Mercado local bloqueado')
    expect(result.market.details.warnings.join(' ')).toContain('Mercado Libre auth unavailable')
  })

  it('removes stale ML-only market assumptions before writing the hybrid evidence', () => {
    const result = applyHybridMarketToAnalysis({
      assumptions: [
        'Mercado local no confirmado: no se reutiliza el benchmark histórico.',
        'Precio local de screening basado en 3 comparables activos de Mercado Libre.',
        'Supuesto logístico independiente que debe conservarse.',
      ],
      market: {},
    }, market(), mlReady)

    expect(result.assumptions).toContain('Supuesto logístico independiente que debe conservarse.')
    expect(result.assumptions.join(' ')).not.toContain('3 comparables activos de Mercado Libre')
    expect(result.assumptions.join(' ')).toContain('6 comparables argentinos aceptados por el matcher')
  })

  it('fails closed when the hybrid benchmark is insufficient instead of retaining an old price', () => {
    const result = applyHybridMarketToAnalysis({
      market: { estimatedPriceArs: 999999, estimatedMonthlyDemand: 12, source: 'historical' },
      confidence: { market: 'old' },
      assumptions: [],
    }, market({
      status: 'insufficient',
      comparableCount: 3,
      suggestedPriceArs: null,
      p25Ars: null,
      medianArs: null,
      p75Ars: null,
    }), mlReady)

    expect(result.market.estimatedPriceArs).toBeNull()
    expect(result.market.estimatedMonthlyDemand).toBe(12)
    expect(result.confidence.market).toBe('insufficient')
    expect(result.assumptions.join(' ')).toContain('no reutiliza un precio histórico')
  })

  it('preserves explicit monthly demand while replacing only market-price evidence', () => {
    const result = applyHybridMarketToAnalysis({
      market: { estimatedPriceArs: 1, estimatedMonthlyDemand: 25 },
      assumptions: [],
    }, market({ suggestedPriceArs: 21000 }), mlReady)

    expect(result.market.estimatedPriceArs).toBe(21000)
    expect(result.market.estimatedMonthlyDemand).toBe(25)
  })

  it('mentions effective-price resolution only when such evidence exists', () => {
    const noEffective = applyHybridMarketToAnalysis({ assumptions: [], market: {} }, market({ effectivePriceCount: 0 }), mlReady)
    const withEffective = applyHybridMarketToAnalysis({ assumptions: [], market: {} }, market({ effectivePriceCount: 2 }), mlReady)

    expect(noEffective.assumptions.join(' ')).not.toContain('precio(s) fueron resueltos')
    expect(withEffective.assumptions.join(' ')).toContain('2 precio(s) fueron resueltos')
  })
})
