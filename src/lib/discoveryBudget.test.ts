import { describe, expect, it } from 'vitest'
import { defaultInputs } from '../data/defaults'
import { applyDiscoveryBudget, MAX_DISCOVERY_CAPITAL_USD, validDiscoveryCapital } from './discoveryBudget'

describe('discovery budget scenario handoff', () => {
  it('applies valid user capital without mutating other scenario inputs', () => {
    const base = { ...defaultInputs, marketPriceArs: 200000, monthlyDemand: 0 }
    const next = applyDiscoveryBudget(base, 10000)
    expect(next.capitalAvailableUsd).toBe(10000)
    expect(next.marketPriceArs).toBe(200000)
    expect(next.monthlyDemand).toBe(0)
    expect(base.capitalAvailableUsd).not.toBe(10000)
  })

  it('rejects zero, negative, non-finite and absurd capital values', () => {
    for (const value of [0, -1, Number.POSITIVE_INFINITY, Number.NaN, MAX_DISCOVERY_CAPITAL_USD + 1]) {
      expect(validDiscoveryCapital(value)).toBe(false)
      expect(applyDiscoveryBudget(defaultInputs, value)).toBe(defaultInputs)
    }
  })

  it('allows a large but bounded business budget', () => {
    expect(validDiscoveryCapital(MAX_DISCOVERY_CAPITAL_USD)).toBe(true)
    expect(applyDiscoveryBudget(defaultInputs, MAX_DISCOVERY_CAPITAL_USD).capitalAvailableUsd).toBe(MAX_DISCOVERY_CAPITAL_USD)
  })
})
