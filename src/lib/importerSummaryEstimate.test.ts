import { describe, expect, it } from 'vitest'
import { compareLandedCost } from './landedCostEngine'
import { buildImporterSummary, estimateLocalPrice, TYPICAL_RESALE_MARKUP } from './importerSummary'

const base = {
  originCountry: 'China',
  quantity: 100,
  unitPriceUsd: 10,
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
  hasImporterSignature: true,
  sensitiveCategory: 'none' as const,
}

describe('estimateLocalPrice', () => {
  it('applies the typical resale markup over the landed cost', () => {
    expect(estimateLocalPrice(100)).toBe(100 * TYPICAL_RESALE_MARKUP)
    expect(estimateLocalPrice(12.5)).toBe(20)
  })

  it('is FX-independent — returns the markup estimate even without a rate', () => {
    expect(estimateLocalPrice(50, null)).toBe(estimateLocalPrice(50, 1000))
  })

  it('returns null only for a non-positive or invalid landed cost', () => {
    expect(estimateLocalPrice(0)).toBeNull()
    expect(estimateLocalPrice(-5)).toBeNull()
    expect(estimateLocalPrice(Number.NaN)).toBeNull()
  })
})

describe('buildImporterSummary caveated (estimate) verdict', () => {
  it('keeps the normal verdict but labels it when the margin rests on an estimate', () => {
    const comparison = compareLandedCost(base)
    const sellPrice = comparison.modes.lcl.unitCostUsd / 0.6 // >=35% margin -> excelente
    const summary = buildImporterSummary(comparison, 100, sellPrice, null, true)
    expect(summary.verdict).toBe('excelente')
    expect(summary.verdictDetail).toContain('precio local estimado, no verificado')
  })

  it('never forces sin-mercado when a margin exists on an estimated price', () => {
    const comparison = compareLandedCost(base)
    const sellPrice = comparison.modes.lcl.unitCostUsd / 0.7
    const summary = buildImporterSummary(comparison, 100, sellPrice, null, true)
    expect(summary.verdict).not.toBe('sin-mercado')
  })

  it('does not append the caveat when market is not an estimate (default false)', () => {
    const comparison = compareLandedCost(base)
    const sellPrice = comparison.modes.lcl.unitCostUsd / 0.6
    const summary = buildImporterSummary(comparison, 100, sellPrice, null)
    expect(summary.verdictDetail).not.toContain('no verificado')
  })

  it('still reports sin-mercado when there is no local price at all, estimate flag notwithstanding', () => {
    const comparison = compareLandedCost(base)
    const summary = buildImporterSummary(comparison, 100, 0, null, true)
    expect(summary.verdict).toBe('sin-mercado')
    expect(summary.verdictDetail).not.toContain('no verificado')
  })
})
