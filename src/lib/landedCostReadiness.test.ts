import { describe, expect, it } from 'vitest'
import { compareLandedCost, lookupFreightRate } from './landedCostEngine'

// Production-readiness regressions for the LIVE freight engine (landedCostEngine.ts), which
// is the one actually wired into the economics pipeline. Focus on the acquisition→freight
// bridge and fail-closed behavior — the two gaps not covered by the existing suite.

const base = {
  originCountry: 'China',
  quantity: 100,
  unitPriceUsd: 10,
  unitWeightKg: 1,
  unitVolumeCbm: 0.01,
  dutyRatePct: 16,
  statisticsRatePct: 3,
  purpose: 'resale' as const,
  entityType: 'company' as const,
  hasImporterSignature: true,
  sensitiveCategory: 'none' as const,
}

describe('freight origin resolution — acquisition → freight bridge', () => {
  it('resolves a provincial Alibaba origin ("Zhejiang, China") to the China rate', () => {
    // Alibaba extraction commonly returns "<Province>, China"; freight must still resolve.
    const rate = lookupFreightRate('Zhejiang, China')
    expect(rate?.country).toBe('China')
    expect(rate?.airMinimumUsd).toBe(150)
  })

  it('resolves another provincial form ("Guangdong, China")', () => {
    expect(lookupFreightRate('Guangdong, China')?.country).toBe('China')
  })
})

describe('freight fail-closed behavior (no fabricated freight/taxes)', () => {
  it('returns missing_origin and fabricates NO freight or taxes for an unknown origin', () => {
    const result = compareLandedCost({ ...base, originCountry: 'Wakanda' })
    expect(result.status).toBe('missing_origin')
    expect(result.origin).toBeNull()
    for (const mode of ['fcl', 'lcl', 'air'] as const) {
      expect(result.modes[mode].available).toBe(false)
      expect(result.modes[mode].freightCostUsd).toBe(0)
      expect(result.modes[mode].dutyUsd).toBe(0)
      expect(result.modes[mode].vatUsd).toBe(0)
      // CIF collapses to FOB — no invented international freight is added.
      expect(result.modes[mode].cifUsd).toBe(result.modes[mode].fobUsd)
    }
    expect(result.bestMode).toBeNull()
  })

  it('returns missing_origin for a blank origin rather than guessing', () => {
    const result = compareLandedCost({ ...base, originCountry: '' })
    expect(result.status).toBe('missing_origin')
    expect(result.bestMode).toBeNull()
  })

  it('returns invalid_input (not a crash) for non-positive quantity', () => {
    const result = compareLandedCost({ ...base, quantity: 0 })
    expect(result.status).toBe('invalid_input')
    expect(result.bestMode).toBeNull()
  })
})
