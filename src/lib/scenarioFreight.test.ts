import { describe, expect, it } from 'vitest'
import { defaultInputs } from '../data/defaults'
import { scenario } from './scenario'

const inputs = {
  ...defaultInputs,
  priceTiers: [{ minQuantity: 300, unitPriceUsd: 25.5 }],
  weightKg: 0.65,
  volumeCbm: 0.006,
  airUsdKg: 6.5,
  airMinimumUsd: 120,
  seaUsdCbm: 150,
  seaMinimumUsd: 250,
  insurancePct: 1,
}

const taxContext = {
  entityType: 'company' as const,
  taxStatus: 'responsable_inscripto' as const,
  purpose: 'resale' as const,
  statisticsExempt: false,
  vatPerceptionExempt: false,
  gainsPerceptionExempt: false,
}

describe('freight integration oracle', () => {
  it('keeps the 300-unit LCL pilot at 1.8 W/M and USD 270', () => {
    const result = scenario(300, 'sea', inputs, taxContext)
    expect(result.freightUsd).toBeCloseTo(270)
    expect(result.customsBaseUsd).toBeCloseTo(7999.2)
  })

  it('uses volumetric air weight and raises the air CIF accordingly', () => {
    const result = scenario(300, 'air', inputs, taxContext)
    expect(result.freightUsd).toBeCloseTo(1950)
    expect(result.customsBaseUsd).toBeCloseTo(9696)
  })
})
