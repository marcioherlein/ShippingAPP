import { describe, expect, it } from 'vitest'
import { evaluateArgentinaMarketSmoke } from './argentina-market-smoke-policy.mjs'

function live(overrides: Record<string, unknown> = {}) {
  return {
    status: 'live',
    providers: { mercadoLibreAuth: 'ready', googleShoppingConfigured: true },
    market: {
      status: 'live',
      source: 'Google Shopping Argentina via SerpApi',
      comparableCount: 6,
      effectivePriceCount: 0,
      suggestedPriceArs: 150000,
      comparables: Array.from({ length: 6 }, (_, index) => ({ id: `g-${index}` })),
      ...((overrides.market as Record<string, unknown>) || {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'market')),
  }
}

describe('Argentina market production smoke policy', () => {
  it('passes only when the live benchmark has enough traceable evidence', () => {
    const policy = evaluateArgentinaMarketSmoke(live(), { minComparables: 5, requireGoogle: true })
    expect(policy.healthy).toBe(true)
    expect(policy.successRate).toBe(1)
  })

  it('fails when Google Shopping is required but not configured', () => {
    const policy = evaluateArgentinaMarketSmoke(live({
      providers: { mercadoLibreAuth: 'ready', googleShoppingConfigured: false },
    }), { requireGoogle: true })
    expect(policy.healthy).toBe(false)
    expect(policy.checks.find((check) => check.name === 'google_shopping_configured')?.passed).toBe(false)
  })

  it('fails a configured-but-insufficient benchmark', () => {
    const policy = evaluateArgentinaMarketSmoke({
      status: 'insufficient',
      providers: { mercadoLibreAuth: 'ready', googleShoppingConfigured: true },
      market: {
        status: 'insufficient',
        source: 'Mercado Libre Argentina API',
        comparableCount: 3,
        suggestedPriceArs: null,
        comparables: [],
      },
    }, { requireGoogle: true })
    expect(policy.healthy).toBe(false)
    expect(policy.successRate).toBeLessThan(1)
  })

  it('fails live status if the suggested price is missing', () => {
    const policy = evaluateArgentinaMarketSmoke(live({ market: { suggestedPriceArs: null } }), { requireGoogle: true })
    expect(policy.healthy).toBe(false)
    expect(policy.checks.find((check) => check.name === 'positive_suggested_price')?.passed).toBe(false)
  })

  it('fails live status if comparables are not traceable in the response', () => {
    const policy = evaluateArgentinaMarketSmoke(live({ market: { comparables: [] } }), { requireGoogle: true })
    expect(policy.healthy).toBe(false)
    expect(policy.checks.find((check) => check.name === 'traceable_comparables')?.passed).toBe(false)
  })

  it('allows a healthy ML-only benchmark only when Google is not an explicit production requirement', () => {
    const body = live({
      providers: { mercadoLibreAuth: 'ready', googleShoppingConfigured: false },
      market: {
        source: 'Mercado Libre Argentina API',
      },
    })
    expect(evaluateArgentinaMarketSmoke(body, { requireGoogle: false }).healthy).toBe(true)
    expect(evaluateArgentinaMarketSmoke(body, { requireGoogle: true }).healthy).toBe(false)
  })
})
