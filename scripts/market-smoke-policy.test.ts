import { describe, expect, it } from 'vitest'
import { evaluateMarketSmoke } from './market-smoke-policy.mjs'

describe('market smoke policy adversarial states', () => {
  it('reports unconfigured provider without pretending it is healthy', () => {
    const result = evaluateMarketSmoke({ auth: { ready: false, apiReady: false } })
    expect(result.state).toBe('unconfigured')
    expect(result.healthy).toBe(false)
    expect(result.successRate).toBe(0)
    expect(result.shouldFailStrictConfigured).toBe(false)
  })

  it('fails configured provider when token/API access is broken', () => {
    const result = evaluateMarketSmoke({ auth: { ready: true, apiReady: false } })
    expect(result.state).toBe('configured_broken')
    expect(result.healthy).toBe(false)
    expect(result.shouldFailStrictConfigured).toBe(true)
  })

  it('fails configured provider when benchmark is insufficient', () => {
    const result = evaluateMarketSmoke(
      { auth: { ready: true, apiReady: true } },
      { status: 'insufficient', market: { comparableCount: 3, suggestedPriceArs: null } },
    )
    expect(result.state).toBe('configured_insufficient')
    expect(result.shouldFailStrictConfigured).toBe(true)
  })

  it('reports healthy only with live benchmark, five comparables and positive price', () => {
    const result = evaluateMarketSmoke(
      { auth: { ready: true, apiReady: true } },
      { status: 'live', market: { comparableCount: 6, suggestedPriceArs: 150000 } },
    )
    expect(result.state).toBe('healthy')
    expect(result.healthy).toBe(true)
    expect(result.successRate).toBe(1)
    expect(result.shouldFailStrictConfigured).toBe(false)
  })

  it('does not treat live-without-price as healthy', () => {
    const result = evaluateMarketSmoke(
      { auth: { ready: true, apiReady: true } },
      { status: 'live', market: { comparableCount: 8, suggestedPriceArs: null } },
    )
    expect(result.healthy).toBe(false)
    expect(result.shouldFailStrictConfigured).toBe(true)
  })
})
