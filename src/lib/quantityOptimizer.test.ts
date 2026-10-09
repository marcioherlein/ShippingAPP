import { describe, expect, it } from 'vitest'
import { generateQuantityCandidates, optimizeQuantity, unitPriceForQuantity } from './quantityOptimizer'
import { initialSupplierQuote } from './supplierQuote'

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
  it('finds affordable quantities inside a discounted band after an unaffordable first band', () => {
    const supplierQuote = { ...initialSupplierQuote(1000, true), minQuantity: 10, maxQuantity: 19, additionalTiers: [{ amount: 10, minQuantity: 20, maxQuantity: 199 }] }
    const result = optimizeQuantity({ ...base, moq: 10, budgetUsd: 3000, supplierQuote, monthlyDemand: 0 })
    const affordable = result.affordableCandidates
    expect(affordable.some(candidate => candidate.quantity > 20 && candidate.quantity < 199)).toBe(true)
    expect(affordable.every(candidate => candidate.unitPriceUsd === 10 && candidate.totalCostUsd <= 3000)).toBe(true)
  })

  it('keeps proposals within the buyer range and aligned with the supplier increment', () => {
    const result = optimizeQuantity({ ...base, moq: 5, unitIncrement: 5, purchaseRange: { min: 21, max: 67 } })
    expect(result.candidates.length).toBeGreaterThan(0)
    expect(result.candidates.every(candidate => candidate.quantity >= 21 && candidate.quantity <= 67 && candidate.quantity % 5 === 0)).toBe(true)
    expect(generateQuantityCandidates({ ...base, purchaseRange: { min: 10, max: 20 } })).toEqual([])
  })

  it('does not mark missing-origin calculations as affordable zero-cost orders', () => {
    const result = optimizeQuantity({ ...base, originCountry: '', budgetUsd: 10000 })
    expect(result.affordableCandidates).toHaveLength(0)
  })
  it('can reduce the initial quantity to meet budget when MOQ is unknown', () => {
    const result = optimizeQuantity({ ...base, quantity: 100, moq: undefined, budgetUsd: 3000 })
    expect(result.affordableCandidates.some(candidate => candidate.quantity < 100)).toBe(true)
    expect(result.candidates.flatMap(candidate => candidate.reasons).join(' ')).not.toContain('Incluye MOQ')
    expect(result.notes.join(' ')).toContain('MOQ sin dato')
  })

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
    expect(['lcl', 'air', 'courier']).toContain(result.recommendation?.selectedMode)
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
