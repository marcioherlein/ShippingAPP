import { describe, expect, it } from 'vitest'
import { evaluateMarketSmoke, evaluateRepresentativeMarketProbes } from './market-smoke-policy.mjs'

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

  it('accepts representative probes only when at least one independently passes the strict policy', () => {
    const status = { auth: { ready: true, apiReady: true } }
    const result = evaluateRepresentativeMarketProbes(status, [
      { status: 'insufficient', market: { comparableCount: 2, suggestedPriceArs: null } },
      { status: 'live', market: { comparableCount: 9, suggestedPriceArs: 32000 } },
      { status: 'unavailable', market: { comparableCount: 0, suggestedPriceArs: null } },
    ])
    expect(result.state).toBe('healthy')
    expect(result.healthy).toBe(true)
    expect(result.shouldFailStrictConfigured).toBe(false)
    expect(result.representativeProbes[0].policy.state).toBe('configured_insufficient')
    expect(result.representativeProbes[1].policy.state).toBe('healthy')
  })

  it('still fails when every representative probe is insufficient', () => {
    const status = { auth: { ready: true, apiReady: true } }
    const result = evaluateRepresentativeMarketProbes(status, [
      { status: 'insufficient', market: { comparableCount: 1, suggestedPriceArs: null } },
      { status: 'insufficient', market: { comparableCount: 4, suggestedPriceArs: null } },
      { status: 'insufficient', market: { comparableCount: 0, suggestedPriceArs: null } },
    ])
    expect(result.state).toBe('configured_insufficient')
    expect(result.healthy).toBe(false)
    expect(result.shouldFailStrictConfigured).toBe(true)
  })

  it('does not let multiple probes hide broken authenticated API access', () => {
    const result = evaluateRepresentativeMarketProbes(
      { auth: { ready: true, apiReady: false } },
      [{ status: 'live', market: { comparableCount: 99, suggestedPriceArs: 1 } }],
    )
    expect(result.state).toBe('configured_broken')
    expect(result.healthy).toBe(false)
    expect(result.shouldFailStrictConfigured).toBe(true)
    expect(result.representativeProbes).toEqual([])
  })
})
