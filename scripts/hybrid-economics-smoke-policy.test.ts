import { describe, expect, it } from 'vitest'
import { evaluateHybridEconomicsSmoke } from './hybrid-economics-smoke-policy.mjs'

function healthy(overrides: Record<string, unknown> = {}) {
  const marketOverride = (overrides.market as Record<string, unknown>) || {}
  const detailsOverride = (marketOverride.details as Record<string, unknown>) || {}
  const analysisOverride = (overrides.analysis as Record<string, unknown>) || {}
  return {
    status: 'ready',
    analysis: {
      product: { name: 'Mouse inalámbrico Logitech M170', category: 'Computer mouse' },
      market: {
        estimatedPriceArs: 33030,
        source: 'Retailers argentinos directos · Frávega + Cetrogar',
        details: {
          status: 'live',
          comparableCount: 9,
          suggestedPriceArs: 33030.2,
          comparables: Array.from({ length: 9 }, (_, index) => ({ id: `retailer-${index}` })),
          ...detailsOverride,
        },
        ...Object.fromEntries(Object.entries(marketOverride).filter(([key]) => key !== 'details')),
      },
      confidence: { market: 'live-85' },
      assumptions: ['Precio local de screening basado en 9 comparables argentinos aceptados por el matcher.'],
      ...analysisOverride,
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'market' && key !== 'analysis')),
  }
}

describe('hybrid economics production smoke policy', () => {
  it('passes a traceable direct-retailer user-path result', () => {
    const policy = evaluateHybridEconomicsSmoke(healthy())
    expect(policy.healthy).toBe(true)
    expect(policy.successRate).toBe(1)
  })

  it('rejects an ML-only source even when status and price look healthy', () => {
    const policy = evaluateHybridEconomicsSmoke(healthy({
      market: { source: 'Mercado Libre Argentina API' },
    }))
    expect(policy.healthy).toBe(false)
    expect(policy.checks.find((check) => check.name === 'direct_retailer_source')?.passed).toBe(false)
  })

  it('rejects stale ML-only assumptions that survive an overlay', () => {
    const policy = evaluateHybridEconomicsSmoke(healthy({
      analysis: { assumptions: ['Mercado local no confirmado: no se reutiliza el benchmark histórico.'] },
    }))
    expect(policy.healthy).toBe(false)
    expect(policy.staleAssumptions).toHaveLength(1)
  })

  it('rejects insufficient or hidden comparable evidence', () => {
    const insufficient = evaluateHybridEconomicsSmoke(healthy({
      market: { details: { comparableCount: 4, comparables: Array.from({ length: 4 }, (_, index) => ({ id: index })) } },
    }))
    expect(insufficient.healthy).toBe(false)
    expect(insufficient.checks.find((check) => check.name === 'minimum_comparables')?.passed).toBe(false)

    const hidden = evaluateHybridEconomicsSmoke(healthy({
      market: { details: { comparables: [] } },
    }))
    expect(hidden.healthy).toBe(false)
    expect(hidden.checks.find((check) => check.name === 'traceable_comparables')?.passed).toBe(false)
  })

  it('rejects a stale user-facing price that diverges from the hybrid suggested price', () => {
    const policy = evaluateHybridEconomicsSmoke(healthy({
      market: { estimatedPriceArs: 999999 },
    }))
    expect(policy.healthy).toBe(false)
    expect(policy.checks.find((check) => check.name === 'authoritative_price_alignment')?.passed).toBe(false)
  })
})
