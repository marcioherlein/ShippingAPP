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
    const result = calculateLandedCostMode('lcl', base, lookupFreightRate('China'))
    expect(result.available).toBe(true)
    expect(result.fobUsd).toBe(1000)
    expect(result.freightCostUsd).toBe(200)
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

  it('compares LCL vs air while keeping FCL as reference', () => {
    const comparison = compareLandedCost(base)
    expect(comparison.status).toBe('ok')
    expect(comparison.modes.fcl.freightCostUsd).toBe(9600)
    expect(comparison.modes.air.freightMinimumUsd).toBe(150)
    expect(comparison.lclVsAir.cheaperMode).toBe('lcl')
    expect(comparison.bestMode).toBe('lcl')
    expect(comparison.modes.air.totalCostUsd).toBeGreaterThan(comparison.modes.lcl.totalCostUsd)
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
