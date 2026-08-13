import { describe, expect, it } from 'vitest'
import { airFreightV2, seaFreightV2 } from './freightV2'

describe('freight chargeable basis', () => {
  it('charges padel air freight by volumetric rather than actual weight', () => {
    const result = airFreightV2(300, 0.65, 0.006, 6.5, 120)
    expect(result.actualWeightKg).toBeCloseTo(195)
    expect(result.chargeableUnits).toBeCloseTo(300)
    expect(result.basis).toBe('volumetric_weight')
    expect(result.costUsd).toBeCloseTo(1950)
  })

  it('uses actual weight for dense air cargo', () => {
    const result = airFreightV2(10, 20, 0.01, 5, 50)
    expect(result.basis).toBe('actual_weight')
    expect(result.chargeableUnits).toBeCloseTo(200)
  })

  it('respects air minimum charge', () => {
    expect(airFreightV2(1, 0.1, 0.0001, 5, 100).basis).toBe('minimum')
  })

  it('charges padel LCL by volume W/M', () => {
    const result = seaFreightV2(300, 0.65, 0.006, 150, 250)
    expect(result.volumeCbm).toBeCloseTo(1.8)
    expect(result.basis).toBe('volume')
    expect(result.costUsd).toBeCloseTo(270)
  })

  it('charges dense LCL by weight measurement', () => {
    const result = seaFreightV2(100, 20, 0.005, 150, 0)
    expect(result.basis).toBe('weight_measurement')
    expect(result.chargeableUnits).toBeCloseTo(2)
  })
})
