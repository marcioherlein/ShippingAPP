import { describe, expect, it } from 'vitest'
import { compareLandedCost, type LandedCostInput, type SensitiveProductCategory } from './landedCostEngine'
import { optimizeQuantity } from './quantityOptimizer'

const base: LandedCostInput = {
  originCountry: 'China',
  quantity: 100,
  unitPriceUsd: 20,
  unitWeightKg: 0.5,
  unitVolumeCbm: 0.004,
  dutyRatePct: 18,
  statisticsRatePct: 3,
  vatRatePct: 21,
  vatAdditionalRatePct: 20,
  gainsRatePct: 6,
  iibbRatePct: 2.5,
  purpose: 'resale',
  entityType: 'company',
  hasImporterSignature: true,
  sensitiveCategory: 'none',
  gainsExempt: false,
  capitalGoodEligible: false,
  capitalGoodUse: false,
}

function lcl(input: Partial<LandedCostInput> = {}) {
  const comparison = compareLandedCost({ ...base, ...input })
  expect(comparison.status).toBe('ok')
  expect(comparison.modes.lcl.available).toBe(true)
  return comparison.modes.lcl
}

describe('adversarial landed-cost and optimizer matrix', () => {
  it.each(['food', 'toys', 'cosmetics', 'medicines', 'supplements'] as SensitiveProductCategory[])(
    '%s adds exactly one fixed USD 200 intervention procedure',
    (category) => {
      const control = lcl({ sensitiveCategory: 'none' })
      const sensitive = lcl({ sensitiveCategory: category })
      expect(sensitive.sensitiveCategoryUsd).toBe(200)
      expect(sensitive.totalCostUsd - control.totalCostUsd).toBeCloseTo(200, 2)
    },
  )

  it('does not add an intervention fee to ordinary goods', () => {
    expect(lcl({ sensitiveCategory: 'none' }).sensitiveCategoryUsd).toBe(0)
  })

  it('adds importer/signature cost independently from intervention cost', () => {
    const control = lcl({ hasImporterSignature: true, sensitiveCategory: 'none' })
    const missingSignature = lcl({ hasImporterSignature: false, sensitiveCategory: 'none' })
    expect(missingSignature.noImporterSignatureUsd).toBe(200)
    expect(missingSignature.totalCostUsd - control.totalCostUsd).toBeCloseTo(200, 2)
  })

  it('capital-good treatment removes statistics and perceptions but retains duty and VAT', () => {
    const result = lcl({ capitalGoodEligible: true, capitalGoodUse: true })
    expect(result.statisticsUsd).toBe(0)
    expect(result.vatAdditionalUsd).toBe(0)
    expect(result.gainsUsd).toBe(0)
    expect(result.iibbUsd).toBe(0)
    expect(result.dutyUsd).toBeGreaterThan(0)
    expect(result.vatUsd).toBeGreaterThan(0)
  })

  it('air freight never falls below the configured minimum', () => {
    const comparison = compareLandedCost({ ...base, quantity: 1, unitWeightKg: 0.05, unitVolumeCbm: 0.0002 })
    expect(comparison.status).toBe('ok')
    expect(comparison.modes.air.freightMinimumUsd).not.toBeNull()
    expect(comparison.modes.air.freightCostUsd).toBeGreaterThanOrEqual(comparison.modes.air.freightMinimumUsd || 0)
  })

  it('fails closed when origin has no freight table row', () => {
    const comparison = compareLandedCost({ ...base, originCountry: 'Atlantis' })
    expect(comparison.status).toBe('missing_origin')
    expect(comparison.bestMode).toBeNull()
  })

  it('rejects non-positive quantity instead of producing economics', () => {
    const comparison = compareLandedCost({ ...base, quantity: 0 })
    expect(comparison.status).toBe('invalid_input')
    expect(comparison.bestMode).toBeNull()
  })

  it('dilutes the fixed intervention procedure as quantity grows', () => {
    const q100 = lcl({ quantity: 100, sensitiveCategory: 'toys' })
    const q200 = lcl({ quantity: 200, sensitiveCategory: 'toys' })
    expect(q100.sensitiveCategoryUsd).toBe(200)
    expect(q200.sensitiveCategoryUsd).toBe(200)
    expect(q200.sensitiveCategoryUsd / 200).toBeCloseTo((q100.sensitiveCategoryUsd / 100) / 2, 6)
  })

  it('never marks an affordable optimizer candidate above the user budget', () => {
    const budgetUsd = 10_000
    const result = optimizeQuantity({
      ...base,
      budgetUsd,
      moq: 50,
      monthlyDemand: 100,
      localSellPriceUsd: 90,
      strategy: 'normal',
    })
    expect(result.affordableCandidates.length).toBeGreaterThan(0)
    expect(result.affordableCandidates.every((candidate) => candidate.totalCostUsd <= budgetUsd)).toBe(true)
    expect(result.recommendation?.affordable).toBe(true)
  })

  it('must not recommend an unaffordable MOQ when the budget cannot fund any candidate', () => {
    const result = optimizeQuantity({
      ...base,
      budgetUsd: 100,
      moq: 100,
      quantity: 100,
      monthlyDemand: 100,
      localSellPriceUsd: 90,
      strategy: 'test',
    })
    expect(result.affordableCandidates).toHaveLength(0)
    expect(result.recommendation === null || result.recommendation.affordable).toBe(true)
  })
})
