import { describe, expect, it } from 'vitest'
import { generateQuantityCandidates, optimizeQuantity, unitPriceForQuantity } from './quantityOptimizer'

const base = {
  originCountry: 'China',
  quantity: 100,
  unitPriceUsd: 40,
  unitWeightKg: 1,
  unitVolumeCbm: 0.01,
  dutyRatePct: 16,
  statisticsRatePct: 3,
  vatRatePct: 21,
  vatAdditionalRatePct: 20,
  gainsRatePct: 6,
  iibbRatePct: 2.5,
  purpose: 'resale' as const,
  entityType: 'company' as const,
  hasImporterSignature: false,
  sensitiveCategory: 'toys' as const,
  budgetUsd: 10000,
  moq: 50,
  monthlyDemand: 60,
  strategy: 'normal' as const,
  localSellPriceUsd: 150,
}

describe('quantity optimizer', () => {
  it('uses supplier price breaks when scoring candidate quantities', () => {
    expect(unitPriceForQuantity(50, 40, [{ minQuantity: 100, unitPriceUsd: 36 }])).toBe(40)
    expect(unitPriceForQuantity(100, 40, [{ minQuantity: 100, unitPriceUsd: 36 }])).toBe(36)
  })

  it('generates candidates from MOQ, current quantity, cbm thresholds and demand horizon', () => {
    const candidates = generateQuantityCandidates(base)

    expect(candidates).toContain(50)
    expect(candidates).toContain(100)
    expect(candidates).toContain(180)
    expect(candidates).toContain(200)
    expect(candidates).toContain(300)
  })

  it('recommends an affordable LCL or air quantity instead of treating FCL as actionable', () => {
    const result = optimizeQuantity(base)

    expect(result.recommendation).not.toBeNull()
    expect(result.recommendation?.affordable).toBe(true)
    expect(result.recommendation?.selectedMode === 'lcl' || result.recommendation?.selectedMode === 'air').toBe(true)
    expect(result.recommendation?.comparison.modes.fcl).toBeDefined()
    expect(result.notes.join(' ')).toContain('FCL queda como referencia')
  })

  it('falls back to the least bad candidate when the MOQ already exceeds budget', () => {
    const result = optimizeQuantity({ ...base, budgetUsd: 1000, moq: 50 })

    expect(result.affordableCandidates).toHaveLength(0)
    expect(result.recommendation).not.toBeNull()
    expect(result.recommendation?.affordable).toBe(false)
    expect(result.recommendation?.reasons.join(' ')).toContain('Supera el presupuesto')
  })
})
