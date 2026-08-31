import { describe, expect, it } from 'vitest'
import {
  applyProductConfirmation,
  createManualProductAnalysis,
  missingClassificationConfirmationFields,
  missingProductConfirmationFields,
  missingQuoteConfirmationFields,
  productConfirmationFromAnalysis,
  resolvedProductVolumeCbm,
} from './productConfirmation'

describe('progressive product confirmation', () => {
  it('does not require logistics before starting nomenclature', () => {
    const draft = productConfirmationFromAnalysis(createManualProductAnalysis('manual://product', 'Reloj de pulsera mecánico automático con caja de acero inoxidable'))
    expect(missingClassificationConfirmationFields(draft)).toHaveLength(0)
    const quoteMissing = missingQuoteConfirmationFields(draft).map((item) => item.id)
    expect(quoteMissing).toContain('originCountry')
    expect(quoteMissing).toContain('unitPriceUsd')
    expect(quoteMissing).toContain('moq')
    expect(quoteMissing).toContain('unitWeightKg')
    expect(quoteMissing).toContain('packageVolume')
  })

  it('asks for product identity when manual input is empty', () => {
    const draft = productConfirmationFromAnalysis(createManualProductAnalysis())
    const missing = missingClassificationConfirmationFields(draft).map((item) => item.id)
    expect(missing).toContain('productName')
    expect(missing).toContain('identity_context')
  })

  it('accepts package dimensions instead of forcing the user to know cubic meters', () => {
    const base = productConfirmationFromAnalysis(createManualProductAnalysis('manual://product', 'Botella térmica de acero inoxidable de 750 ml'))
    const draft = {
      ...base,
      originCountry: 'China',
      unitPriceUsd: 7.5,
      moq: 50,
      unitWeightKg: 0.42,
      packageLengthCm: 9,
      packageWidthCm: 9,
      packageHeightCm: 32,
    }
    expect(resolvedProductVolumeCbm(draft)).toBeCloseTo(0.002592)
    expect(missingQuoteConfirmationFields(draft)).toHaveLength(0)
  })

  it('preserves a resolved NCM when only quote/logistics facts change', () => {
    const base = createManualProductAnalysis('manual://product', 'Reloj de pulsera mecánico automático con caja de acero inoxidable')
    base.customs = {
      ...base.customs,
      ncmCandidate: '9102.21.00',
      classificationConfidence: 'high',
      dutyRatePct: 20,
      dutyRateStatus: 'candidate',
    }
    const draft = productConfirmationFromAnalysis(base)
    const next = applyProductConfirmation(base, {
      ...draft,
      originCountry: 'China',
      unitPriceUsd: 32.5,
      moq: 20,
      unitWeightKg: 0.18,
      unitVolumeCbm: 0.0009,
    })
    expect(next.customs.ncmCandidate).toBe('9102.21.00')
    expect(next.customs.classificationConfidence).toBe('high')
  })

  it('invalidates stale customs when the product identity changes', () => {
    const base = createManualProductAnalysis('manual://product', 'Reloj de pulsera mecánico automático con caja de acero inoxidable')
    base.customs = {
      ...base.customs,
      ncmCandidate: '9102.21.00',
      classificationConfidence: 'high',
      dutyRatePct: 20,
      dutyRateStatus: 'candidate',
    }
    const draft = productConfirmationFromAnalysis(base)
    const next = applyProductConfirmation(base, {
      ...draft,
      productName: 'Smartwatch con pantalla AMOLED y conexión Bluetooth',
      description: 'Reloj inteligente electrónico con Bluetooth y pantalla táctil.',
    })
    expect(next.customs.ncmCandidate).toBeNull()
    expect(next.customs.dutyRatePct).toBeNull()
  })

  it('keeps the full readiness helper for final quote gates', () => {
    const draft = productConfirmationFromAnalysis(createManualProductAnalysis('manual://product', 'Reloj de pulsera mecánico automático con caja de acero inoxidable'))
    expect(missingProductConfirmationFields(draft).length).toBeGreaterThan(0)
  })
})
