import { describe, expect, it } from 'vitest'
import { supplierTierMatches, supplierUnitUsd, type SupplierPrice } from './supplierPrice'
const now = Date.parse('2026-09-28T12:00:00Z')
const base: SupplierPrice = { amount: 100, currency: 'USD', unitsPerPack: 1, variant: 'A', minQuantity: 10, maxQuantity: 99 }
describe('source-backed supplier conversion', () => {
  it('never treats an ambiguous dollar sign as USD', () => { expect(supplierUnitUsd({ ...base, currency: '$' }, undefined, now)).toBeNull() })
  it('keeps USD and divides a pack once', () => { expect(supplierUnitUsd(base, undefined, now)).toBe(100); expect(supplierUnitUsd({ ...base, unitsPerPack: 5 }, undefined, now)).toBe(20) })
  it('converts ARS in the official direction only', () => {
    const fx = { status: 'live' as const, arsPerUsd: 1500, sourceDate: '2026-09-28', source: 'BCRA A3500', code: 'REF' as const, note: '' }
    expect(supplierUnitUsd({ ...base, amount: 3000, currency: 'ARS' }, fx, now)).toBe(2)
    expect(supplierUnitUsd({ ...base, currency: 'CNY' }, fx, now)).toBeNull()
    expect(supplierUnitUsd({ ...base, currency: 'ARS' }, { ...fx, sourceDate: '2026-01-01' }, now)).toBeNull()
  })
  it('requires matching dated cross-rate evidence', () => {
    const price = { ...base, currency: 'CNY', crossRate: { currency: 'CNY', usdPerCurrency: 0.14, date: '2026-09-28', source: 'https://api.frankfurter.dev/v2/providers/ecb/rate/cny/usd' } }
    expect(supplierUnitUsd(price, undefined, now)).toBeCloseTo(14)
    expect(supplierUnitUsd({ ...price, currency: 'BRL' }, undefined, now)).toBeNull()
  })
  it('invalidates a price outside its volume tier', () => { expect(supplierTierMatches(base, 10)).toBe(true); expect(supplierTierMatches(base, 100)).toBe(false); expect(supplierTierMatches(base, 1.5)).toBe(false) })
})
