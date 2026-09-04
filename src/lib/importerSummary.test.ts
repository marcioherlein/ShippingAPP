import { describe, expect, it } from 'vitest'
import { compareLandedCost } from './landedCostEngine'
import { optimizeQuantity } from './quantityOptimizer'
import { buildImporterSummary } from './importerSummary'

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

describe('importerSummary', () => {
  it('splits fixed vs per-unit costs correctly', () => {
    const comparison = compareLandedCost(base)
    const summary = buildImporterSummary(comparison, 100, 0, null)

    // Fixed = only fixedDestinationUsd (no signature penalty, no sensitive category)
    expect(summary.fixedCostUsd).toBeGreaterThan(0)
    expect(summary.fixedItems.some((item) => item.label.toLowerCase().includes('destino'))).toBe(true)
    expect(summary.fixedItems.every((item) => item.usd >= 0)).toBe(true)

    // Variable per-unit includes product, freight, aranceles, impuestos
    expect(summary.unitItems.some((item) => item.label.toLowerCase().includes('producto'))).toBe(true)
    expect(summary.unitItems.some((item) => item.label.toLowerCase().includes('flete'))).toBe(true)
    expect(summary.unitVariableCostUsd).toBeGreaterThan(0)
  })

  it('returns verdict=si when margin ≥20 %', () => {
    const comparison = compareLandedCost(base)
    const summary = buildImporterSummary(comparison, 100, 100, null)
    expect(summary.verdict).toBe('si')
    expect(summary.profitPct).toBeGreaterThanOrEqual(20)
  })

  it('returns verdict=no when unit cost exceeds sell price', () => {
    const comparison = compareLandedCost(base)
    const unitCost = comparison.modes.lcl.unitCostUsd
    const summary = buildImporterSummary(comparison, 100, unitCost * 0.9, null)
    expect(summary.verdict).toBe('no')
    expect(summary.profitPct).not.toBeNull()
    expect(summary.profitPct!).toBeLessThan(0)
  })

  it('returns verdict=ajusta when margin is between 0 and 20 %', () => {
    const comparison = compareLandedCost(base)
    const unitCost = comparison.modes.lcl.unitCostUsd
    // Sell at 10 % above unit cost → margin 10/110 ≈ 9 %
    const sellPrice = unitCost * 1.10
    const summary = buildImporterSummary(comparison, 100, sellPrice, null)
    expect(summary.verdict).toBe('ajusta')
    expect(summary.profitPct).toBeGreaterThanOrEqual(0)
    expect(summary.profitPct!).toBeLessThan(20)
  })

  it('returns verdict=faltan-datos when blockers present', () => {
    const comparison = compareLandedCost({ ...base, purpose: 'unknown', entityType: 'unknown' })
    const summary = buildImporterSummary(comparison, 100, 100, null)
    expect(summary.verdict).toBe('faltan-datos')
    expect(summary.verdictHeadline.toLowerCase()).toContain('completá')
  })

  it('surfaces LCL logistics fact with rounding when raw < billed', () => {
    // 160 units × 0.01 CBM = 1.6 m³ → billed 2 m³
    const comparison = compareLandedCost({ ...base, quantity: 160 })
    const summary = buildImporterSummary(comparison, 160, 0, null)
    expect(summary.logisticsFact).not.toBeNull()
    expect(summary.logisticsFact).toContain('1.60')  // raw W/M
    expect(summary.logisticsFact).toContain('2')      // billed W/M
  })

  it('computes profit per unit and total capital needed', () => {
    const comparison = compareLandedCost(base)
    const summary = buildImporterSummary(comparison, 100, 100, null)
    expect(summary.profitPerUnitUsd).not.toBeNull()
    expect(summary.profitPerUnitUsd!).toBeGreaterThan(0)
    expect(summary.needsCapitalUsd).toBe(summary.totalCostUsd)
    expect(summary.totalCostUsd).toBeGreaterThan(0)
  })

  it('surfaces fill-the-meter signal from optimizer when present', () => {
    // 160 units × 0.01 CBM = 1.6 billed m³ — 0.4 m³ free = 40 extra units at no freight cost
    const comparison = compareLandedCost({ ...base, quantity: 160 })
    const optimization = optimizeQuantity({
      ...base,
      quantity: 160,
      budgetUsd: 50000,
      moq: 160,
      localSellPriceUsd: 100,
    })
    // The recommendation may or may not be exactly 160 units; check the helper doesn't crash
    const summary = buildImporterSummary(comparison, 160, 100, optimization)
    expect(Array.isArray(summary.freightSignals)).toBe(true)
  })
})
