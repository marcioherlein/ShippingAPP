import { describe, expect, it } from 'vitest'
import { evaluateArgentinaMarketSmoke } from './argentina-market-smoke-policy.mjs'

function live(source = 'Retailers argentinos directos · Frávega + Cetrogar', overrides: Record<string, unknown> = {}) {
  return {
    status: 'live',
    providers: { mercadoLibreAuth: 'ready', googleShoppingConfigured: false },
    market: {
      status: 'live',
      source,
      comparableCount: 6,
      effectivePriceCount: 0,
      suggestedPriceArs: 150000,
      comparables: Array.from({ length: 6 }, (_, index) => ({ id: `c-${index}` })),
      ...((overrides.market as Record<string, unknown>) || {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'market')),
  }
}

describe('Argentina market combined production smoke policy', () => {
  it('passes a healthy free direct-retailer benchmark', () => {
    const policy = evaluateArgentinaMarketSmoke(live(), { minComparables: 5, requireDirectRetailer: true })
    expect(policy.healthy).toBe(true)
    expect(policy.successRate).toBe(1)
  })

  it('still accepts a healthy Mercado Libre benchmark for the general product gate', () => {
    const policy = evaluateArgentinaMarketSmoke(live('Mercado Libre Argentina API'), { minComparables: 5 })
    expect(policy.healthy).toBe(true)
  })

  it('does not misrepresent an ML-only benchmark as proof of the free retailer path', () => {
    const policy = evaluateArgentinaMarketSmoke(live('Mercado Libre Argentina API'), { requireDirectRetailer: true })
    expect(policy.healthy).toBe(false)
    expect(policy.checks.find((check) => check.name === 'direct_retailer_source')?.passed).toBe(false)
  })

  it('fails insufficient evidence even if a source label exists', () => {
    const policy = evaluateArgentinaMarketSmoke({
      status: 'insufficient',
      market: {
        status: 'insufficient',
        source: 'Retailers argentinos directos · Frávega',
        comparableCount: 3,
        suggestedPriceArs: null,
        comparables: [],
      },
    }, { requireDirectRetailer: true })
    expect(policy.healthy).toBe(false)
    expect(policy.successRate).toBeLessThan(1)
  })

  it('fails a nominally live result with no positive price', () => {
    const policy = evaluateArgentinaMarketSmoke(live(undefined, { market: { suggestedPriceArs: null } }), { requireDirectRetailer: true })
    expect(policy.healthy).toBe(false)
    expect(policy.checks.find((check) => check.name === 'positive_suggested_price')?.passed).toBe(false)
  })

  it('fails a nominally live result that hides its comparable evidence', () => {
    const policy = evaluateArgentinaMarketSmoke(live(undefined, { market: { comparables: [] } }), { requireDirectRetailer: true })
    expect(policy.healthy).toBe(false)
    expect(policy.checks.find((check) => check.name === 'traceable_comparables')?.passed).toBe(false)
  })
})
