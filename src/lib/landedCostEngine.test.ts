import { describe, expect, it } from 'vitest'
import { calculateLandedCostMode, checklistStatus, compareLandedCost, lookupFreightRate } from './landedCostEngine'

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
  hasImporterSignature: false,
  sensitiveCategory: 'toys' as const,
}

describe('Valores landed cost engine', () => {
  it('loads China freight rates from the uploaded Valores workbook', () => {
    const rate = lookupFreightRate('china')
    expect(rate?.country).toBe('China')
    expect(rate?.fclContainerUsd).toBe(9600)
    expect(rate?.lclUsdPerWm).toBe(200)
    expect(rate?.airUsdPerKg).toBe(8)
    expect(rate?.airMinimumUsd).toBe(150)
  })

  it('calculates LCL CIF, taxes, fixed expenses and special add-ons', () => {
    // 100 units × 0.01 CBM = 1.0 CBM = 1.0 W/M (lands on step boundary, no rounding up)
    const result = calculateLandedCostMode('lcl', base, lookupFreightRate('China'))
    expect(result.available).toBe(true)
    expect(result.fobUsd).toBe(1000)
    expect(result.freightCostUsd).toBe(200)   // 1 billed W/M × $200
    expect(result.lclRawWm).toBe(1)
    expect(result.lclBilledWm).toBe(1)
    expect(result.cifUsd).toBe(1200)
    expect(result.dutyUsd).toBe(192)
    expect(result.statisticsUsd).toBe(36)
    expect(result.baseVatUsd).toBe(1428)
    expect(result.vatUsd).toBe(299.88)
    expect(result.vatAdditionalUsd).toBe(285.6)
    expect(result.gainsUsd).toBe(85.68)
    expect(result.iibbUsd).toBe(35.7)
    expect(result.fixedDestinationUsd).toBe(2100)
    expect(result.noImporterSignatureUsd).toBe(200)
    expect(result.sensitiveCategoryUsd).toBe(200)
    expect(result.totalCostUsd).toBe(4634.86)
    expect(result.unitCostUsd).toBe(46.35)
  })

  it('rounds LCL fractional W/M up to the next whole billed meter', () => {
    // 160 units × 0.01 CBM = 1.6 raw W/M → billed as 2 W/M
    const result = calculateLandedCostMode('lcl', { ...base, quantity: 160 }, lookupFreightRate('China'))
    expect(result.available).toBe(true)
    expect(result.lclRawWm).toBeCloseTo(1.6, 5)
    expect(result.lclBilledWm).toBe(2)
    expect(result.freightCostUsd).toBe(400)   // 2 billed W/M × $200
  })

  it('applies 1 W/M minimum for small LCL shipments', () => {
    // 30 units × 0.01 CBM = 0.3 CBM; weight=30kg → weight measurement=0.03; raw W/M=0.3 → billed as 1 W/M
    const result = calculateLandedCostMode('lcl', { ...base, quantity: 30 }, lookupFreightRate('China'))
    expect(result.available).toBe(true)
    expect(result.lclRawWm).toBeCloseTo(0.3, 5)
    expect(result.lclBilledWm).toBe(1)
    expect(result.freightCostUsd).toBe(200)   // 1 W/M minimum × $200
  })

  it('counts multiple FCL containers for oversized shipments', () => {
    // 6000 units × 0.01 CBM = 60 CBM > 58 m³ (40ft capacity) → 2 containers
    const result = calculateLandedCostMode('fcl', { ...base, quantity: 6000 }, lookupFreightRate('China'))
    expect(result.available).toBe(true)
    expect(result.fclContainers).toBe(2)
    expect(result.fclFitsInOne).toBe(false)
    expect(result.freightCostUsd).toBe(19200)  // 2 × $9600
  })

  it('single FCL container for a shipment that fits in 40ft', () => {
    // 5000 units × 0.01 CBM = 50 CBM < 58 m³ → 1 container
    const result = calculateLandedCostMode('fcl', { ...base, quantity: 5000 }, lookupFreightRate('China'))
    expect(result.fclContainers).toBe(1)
    expect(result.fclFitsInOne).toBe(true)
    expect(result.freightCostUsd).toBe(9600)
  })

  it('compares LCL vs air while keeping FCL as reference', () => {
    const comparison = compareLandedCost(base)
    expect(comparison.status).toBe('ok')
    expect(comparison.modes.air.freightMinimumUsd).toBe(150)
    expect(comparison.lclVsAir.cheaperMode).toBe('lcl')
    expect(comparison.bestMode).toBe('lcl')
    expect(comparison.modes.air.totalCostUsd).toBeGreaterThan(comparison.modes.lcl.totalCostUsd)
  })

  it('FCL is never bestMode regardless of volume or cost', () => {
    // 5000 units: 50 CBM → 1 FCL container ($9600) vs LCL 50 W/M ($10000).
    // Even when FCL freight is cheaper, bestMode stays lcl or air.
    const shipment = compareLandedCost({
      ...base,
      quantity: 5000,
      unitPriceUsd: 4,
      unitWeightKg: 0.2,
      unitVolumeCbm: 0.01,
      hasImporterSignature: true,
      sensitiveCategory: 'none',
    })

    expect(shipment.status).toBe('ok')
    expect(shipment.modes.fcl.fclContainers).toBe(1)
    expect(shipment.modes.fcl.freightCostUsd).toBe(9600)
    expect(shipment.bestMode).not.toBe('fcl')
    expect(['lcl', 'air']).toContain(shipment.bestMode)
    expect(shipment.notes.join(' ')).toContain('FCL se calcula como referencia')
  })

  it('keeps checklist focused on the four required business inputs', () => {
    const status = checklistStatus({ purpose: 'unknown', entityType: 'unknown', hasImporterSignature: null, sensitiveCategory: 'unknown' })
    expect(status.blockers).toEqual([
      'Definir si es uso propio o reventa.',
      'Definir si opera empresa o persona humana.',
      'Definir si tiene firma/importador para la operación.',
      'Confirmar si cae en alimentos, juguetes, cosméticos, medicamentos o suplementos.',
    ])
  })
})
