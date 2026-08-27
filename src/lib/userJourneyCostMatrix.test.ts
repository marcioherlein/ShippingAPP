import { describe, expect, it } from 'vitest'
import { compareLandedCost, type LandedCostInput, type SensitiveProductCategory } from './landedCostEngine'

const base: LandedCostInput = {
  originCountry: 'China',
  quantity: 100,
  unitPriceUsd: 20,
  unitWeightKg: 0.5,
  unitVolumeCbm: 0.005,
  dutyRatePct: 20,
  statisticsRatePct: 3,
  vatRatePct: 21,
  vatAdditionalRatePct: 20,
  gainsRatePct: 6,
  iibbRatePct: 2.5,
  purpose: 'resale',
  entityType: 'company',
  hasImporterSignature: true,
  sensitiveCategory: 'none',
  capitalGoodEligible: false,
  capitalGoodUse: false,
}

describe('end-user landed-cost state matrix', () => {
  it.each(['food', 'toys', 'cosmetics', 'medicines', 'supplements'] as SensitiveProductCategory[])(
    'adds exactly USD 200 per operation for intervention group %s',
    (sensitiveCategory) => {
      const quote = compareLandedCost({ ...base, sensitiveCategory })
      expect(quote.status).toBe('ok')
      for (const mode of ['fcl', 'lcl', 'air'] as const) {
        expect(quote.modes[mode].sensitiveCategoryUsd).toBe(200)
      }
    },
  )

  it('does not add intervention cost when the category does not require it', () => {
    const quote = compareLandedCost({ ...base, sensitiveCategory: 'none' })
    expect(quote.modes.lcl.sensitiveCategoryUsd).toBe(0)
    expect(quote.modes.air.sensitiveCategoryUsd).toBe(0)
  })

  it('keeps unknown intervention status visible without silently charging USD 200', () => {
    const quote = compareLandedCost({ ...base, sensitiveCategory: 'unknown' })
    expect(quote.checklist.sensitiveCategoryKnown).toBe(false)
    expect(quote.modes.lcl.sensitiveCategoryUsd).toBe(0)
  })

  it('adds the importer-signature fee independently from intervention fees', () => {
    const quote = compareLandedCost({ ...base, hasImporterSignature: false, sensitiveCategory: 'food' })
    expect(quote.modes.lcl.noImporterSignatureUsd).toBe(200)
    expect(quote.modes.lcl.sensitiveCategoryUsd).toBe(200)
    expect(quote.modes.lcl.noImporterSignatureUsd + quote.modes.lcl.sensitiveCategoryUsd).toBe(400)
  })

  it('fails safely when freight origin is not present in the table', () => {
    const quote = compareLandedCost({ ...base, originCountry: 'Atlantis' })
    expect(quote.status).toBe('missing_origin')
    expect(quote.bestMode).toBeNull()
  })

  it('enforces the configured air-freight minimum for small shipments', () => {
    const quote = compareLandedCost({ ...base, quantity: 1, unitWeightKg: 0.1, unitVolumeCbm: 0.0005 })
    expect(quote.status).toBe('ok')
    expect(quote.modes.air.freightMinimumUsd).toBe(150)
    expect(quote.modes.air.freightCostUsd).toBeGreaterThanOrEqual(150)
  })

  it('applies capital-good treatment only when both eligible and selected', () => {
    const quote = compareLandedCost({ ...base, capitalGoodEligible: true, capitalGoodUse: true })
    for (const mode of ['fcl', 'lcl', 'air'] as const) {
      expect(quote.modes[mode].statisticsUsd).toBe(0)
      expect(quote.modes[mode].vatAdditionalUsd).toBe(0)
      expect(quote.modes[mode].gainsUsd).toBe(0)
      expect(quote.modes[mode].iibbUsd).toBe(0)
    }
  })

  it('rejects zero quantity instead of returning a plausible quote', () => {
    const quote = compareLandedCost({ ...base, quantity: 0 })
    expect(quote.status).toBe('invalid_input')
    expect(quote.bestMode).toBeNull()
  })
})
