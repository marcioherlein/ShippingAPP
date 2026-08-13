import { describe, expect, it } from 'vitest'
import { freightRateStatus, quoteFixedCharges, type FreightRateRecord } from './freightRates'

const base: FreightRateRecord = {
  id: 'rate-1', provider: 'Forwarder A', mode: 'air', origin: 'Shanghai', destination: 'Buenos Aires',
  currency: 'USD', rate: 6.5, rateUnit: 'kg', minimumUsd: 120,
  originChargesUsd: 50, destinationChargesUsd: 80, otherSurchargesUsd: 20,
  validFrom: '2026-08-01', validTo: '2026-08-31', sourceType: 'rate_sheet', receivedAt: '2026-08-10',
}

describe('freight rate records', () => {
  it('accepts a valid in-force air rate', () => {
    expect(freightRateStatus(base, '2026-08-13')).toBe('valid')
  })
  it('rejects expired rates', () => {
    expect(freightRateStatus(base, '2026-09-01')).toBe('expired')
  })
  it('rejects mode/unit mismatches', () => {
    expect(freightRateStatus({ ...base, rateUnit: 'wm' }, '2026-08-13')).toBe('invalid')
  })
  it('does not hide fixed quote charges', () => {
    expect(quoteFixedCharges(base)).toBe(150)
  })
})
