import { describe, expect, it } from 'vitest'
import { benchmark, quantitiesFromMoq } from './index'

describe('product extraction benchmark adversarial rules', () => {
  it('does not fabricate generic weight, volume, market price or demand', () => {
    const generic = benchmark('Power adapter')
    expect(generic.key).toBe('generic')
    expect(generic.packedWeightKg).toBe(0)
    expect(generic.volumeCbm).toBe(0)
    expect(generic.marketPriceArs).toBe(0)
    expect(generic.monthlyDemand).toBe(0)
    expect(generic.defaultMoq).toBeNull()
  })

  it('keeps padel logistics benchmarks explicit but never supplies demand', () => {
    const padel = benchmark('Padel racket')
    expect(padel.key).toBe('padel_racket')
    expect(padel.packedWeightKg).toBeGreaterThan(0)
    expect(padel.volumeCbm).toBeGreaterThan(0)
    expect(padel.monthlyDemand).toBe(0)
  })

  it('does not invent scenario quantities without a MOQ', () => {
    expect(quantitiesFromMoq(null)).toEqual([])
    expect(quantitiesFromMoq(0)).toEqual([])
  })

  it('derives scenario quantities only from a known MOQ', () => {
    expect(quantitiesFromMoq(200)).toEqual([200, 300, 400, 600])
  })
})
