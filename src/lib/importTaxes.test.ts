import { describe, expect, it } from 'vitest'
import { calculateImportTaxes } from './importTaxes'

const base = {
  customsBaseUsd: 1000,
  dutyRatePct: 14,
  dutyRateVerified: true,
  statisticsRatePct: 3,
  statisticsExempt: false,
  vatRatePct: 21,
  vatPerceptionPct: 20,
  gainsPerceptionPct: 6,
  iibbPerceptionPct: 2.5,
  taxStatus: 'responsable_inscripto' as const,
  purpose: 'resale' as const,
  entityType: 'company' as const,
  vatPerceptionExempt: false,
  gainsPerceptionExempt: false,
}

describe('import tax filters', () => {
  it('sets Ganancias perception to zero when the user marks exento ganancias', () => {
    const normal = calculateImportTaxes(base)
    const exempt = calculateImportTaxes({ ...base, gainsPerceptionExempt: true })
    expect(normal.gainsPerceptionUsd).toBeGreaterThan(0)
    expect(exempt.gainsPerceptionUsd).toBe(0)
    expect(exempt.assumptions.join(' ')).toContain('Ganancias')
  })

  it('models Bien de Uso as derechos plus import VAT only when the NCM permits it and user selects it', () => {
    const result = calculateImportTaxes({ ...base, capitalGoodEligible: true, capitalGoodUse: true })
    expect(result.importDutyUsd).toBe(140)
    expect(result.importVatUsd).toBeGreaterThan(0)
    expect(result.statisticsFeeUsd).toBe(0)
    expect(result.vatPerceptionUsd).toBe(0)
    expect(result.gainsPerceptionUsd).toBe(0)
    expect(result.iibbPerceptionUsd).toBe(0)
    expect(result.cashTaxesUsd).toBe(result.importDutyUsd + result.importVatUsd)
  })

  it('does not apply Bien de Uso treatment when the NCM row is not eligible', () => {
    const result = calculateImportTaxes({ ...base, capitalGoodEligible: false, capitalGoodUse: true })
    expect(result.statisticsFeeUsd).toBeGreaterThan(0)
    expect(result.vatPerceptionUsd).toBeGreaterThan(0)
    expect(result.gainsPerceptionUsd).toBeGreaterThan(0)
    expect(result.iibbPerceptionUsd).toBeGreaterThan(0)
  })
})
