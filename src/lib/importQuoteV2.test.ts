import { describe, expect, it } from 'vitest'
import { buildImportChecklistV2, calculateImportQuoteV2, getFreightRate } from './importQuoteV2'

const baseInput = {
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
  purpose: 'resale',
  actor: 'company',
  importerSignature: 'no_importer_signature',
  sensitiveCategory: 'toys',
  marketPriceUsd: 150,
} as const

describe('import quote v2', () => {
  it('loads Excel freight rates for China across FCL, LCL and air', () => {
    const rate = getFreightRate('China')

    expect(rate.fclUsdContainer).toBe(9600)
    expect(rate.lclUsdCbm).toBe(200)
    expect(rate.airUsdKg).toBe(8)
    expect(rate.airMinimumUsd).toBe(150)
  })

  it('keeps the new checklist limited to the four business questions', () => {
    const checklist = buildImportChecklistV2({
      purpose: 'resale',
      actor: 'company',
      importerSignature: 'no_importer_signature',
      sensitiveCategory: 'toys',
    })

    expect(checklist.required).toHaveLength(4)
    expect(checklist.sensitiveCategoryRequiresExtraReview).toBe(true)
    expect(checklist.warnings.join(' ')).toContain('Sin firma importadora')
    expect(checklist.warnings.join(' ')).toContain('Categoría sensible')
  })

  it('calculates LCL, air and FCL reference using the uploaded gastos formulas', () => {
    const quote = calculateImportQuoteV2(baseInput)

    const lcl = quote.quotes.find((item) => item.mode === 'lcl')!
    const air = quote.quotes.find((item) => item.mode === 'air')!
    const fcl = quote.quotes.find((item) => item.mode === 'fcl_reference')!

    expect(lcl.fobUsd).toBe(4000)
    expect(lcl.freightUsd).toBe(200)
    expect(lcl.cifUsd).toBe(4200)
    expect(lcl.importDutyUsd).toBe(672)
    expect(lcl.statisticsFeeUsd).toBe(126)
    expect(lcl.vatBaseUsd).toBe(4998)
    expect(lcl.fixedChargesUsd).toBe(2100)
    expect(lcl.noImporterSignatureUsd).toBe(200)
    expect(lcl.sensitiveCategoryUsd).toBe(200)
    expect(lcl.finalCostUsd).toBe(9972.01)
    expect(lcl.finalUnitCostUsd).toBe(99.72)

    expect(air.freightUsd).toBe(1333.33)
    expect(air.finalCostUsd).toBe(11288.27)
    expect(fcl.freightUsd).toBe(9600)
    expect(fcl.finalCostUsd).toBe(28295.08)

    expect(quote.comparison.recommendedMode).toBe('lcl')
    expect(quote.comparison.lclVsAirDeltaUsd).toBe(1316.26)
    expect(quote.comparison.fclReferenceIncluded).toBe(true)
  })
})
