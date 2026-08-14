import { describe, expect, it } from 'vitest'
import { applyExpertOverride, emptyExpertOverride, normalizeNcm, validateExpertOverride } from './expertOverride'
import { defaultInputs } from '../data/defaults'

const validDraft = {
  ...emptyExpertOverride,
  ncm: '8504.40.90',
  dutyRatePct: 16,
  supplierUnitPriceUsd: 18.5,
  moq: 200,
  unitWeightKg: 0.42,
  unitVolumeCbm: 0.0035,
  marketPriceArs: 95000,
  userCheckedOfficialSource: false,
  sourceNote: '',
}

describe('expert override adversarial rules', () => {
  it('normalizes exactly 8 NCM digits', () => {
    expect(normalizeNcm('85044090')).toBe('8504.40.90')
    expect(normalizeNcm('8504.40.90')).toBe('8504.40.90')
  })

  it('rejects malformed or incomplete NCMs', () => {
    expect(normalizeNcm('9506.59')).toBeNull()
    expect(validateExpertOverride({ ...validDraft, ncm: '123' }).valid).toBe(false)
  })

  it('rejects duties outside 0-100', () => {
    expect(validateExpertOverride({ ...validDraft, dutyRatePct: -1 }).valid).toBe(false)
    expect(validateExpertOverride({ ...validDraft, dutyRatePct: 101 }).valid).toBe(false)
  })

  it('allows a legitimate 0% duty without marking it automatically verified', () => {
    const checked = validateExpertOverride({ ...validDraft, dutyRatePct: 0 })
    expect(checked.valid).toBe(true)
    const applied = applyExpertOverride(defaultInputs, checked.value!)
    expect(applied.dutyRatePct).toBe(0)
    expect(applied.dutyRateVerified).toBe(false)
  })

  it('fails closed when supplier price is missing rather than inheriting demo price', () => {
    expect(validateExpertOverride({ ...validDraft, supplierUnitPriceUsd: null }).valid).toBe(false)
  })

  it('fails closed when weight or volume is missing rather than inheriting padel logistics', () => {
    expect(validateExpertOverride({ ...validDraft, unitWeightKg: null }).valid).toBe(false)
    expect(validateExpertOverride({ ...validDraft, unitVolumeCbm: null }).valid).toBe(false)
  })

  it('fails closed when local market benchmark is missing', () => {
    expect(validateExpertOverride({ ...validDraft, marketPriceArs: null }).valid).toBe(false)
  })

  it('requires a source note when user claims an official-source check', () => {
    expect(validateExpertOverride({ ...validDraft, userCheckedOfficialSource: true, sourceNote: '' }).valid).toBe(false)
    expect(validateExpertOverride({ ...validDraft, userCheckedOfficialSource: true, sourceNote: 'ARCA Arancel Integrado 14/08/2026' }).valid).toBe(true)
  })

  it('replaces the demo price tier instead of mixing it with manual supplier evidence', () => {
    const override = validateExpertOverride(validDraft).value!
    const applied = applyExpertOverride(defaultInputs, override)
    expect(applied.priceTiers).toEqual([{ minQuantity: 200, unitPriceUsd: 18.5 }])
  })

  it('never generates scenario quantities below the user-supplied MOQ', () => {
    const override = validateExpertOverride(validDraft).value!
    const applied = applyExpertOverride({ ...defaultInputs, quantities: [50, 100, 300, 500] }, override)
    expect(applied.quantities).toEqual([200, 300, 500])
  })

  it('does not silently alter unrelated tax or freight assumptions', () => {
    const override = validateExpertOverride(validDraft).value!
    const applied = applyExpertOverride(defaultInputs, override)
    expect(applied.vatRatePct).toBe(defaultInputs.vatRatePct)
    expect(applied.airUsdKg).toBe(defaultInputs.airUsdKg)
    expect(applied.fixedFeesUsd).toBe(defaultInputs.fixedFeesUsd)
  })
})
