import { describe, expect, it } from 'vitest'
import { applyFreightRate, parseFreightRateCsv, selectFreightRate } from './freightRateImport'
import { defaultInputs } from '../data/defaults'

const header = 'id,provider,mode,origin,destination,currency,rate,rateUnit,minimumUsd,originChargesUsd,destinationChargesUsd,otherSurchargesUsd,validFrom,validTo,sourceType,receivedAt'
const row = (overrides: Partial<Record<string, string>> = {}) => {
  const values: Record<string, string> = {
    id: 'r1', provider: 'Forwarder A', mode: 'air', origin: 'Shanghai', destination: 'Buenos Aires', currency: 'USD', rate: '6.5', rateUnit: 'kg', minimumUsd: '120', originChargesUsd: '50', destinationChargesUsd: '80', otherSurchargesUsd: '20', validFrom: '2026-08-01', validTo: '2026-08-31', sourceType: 'rate_sheet', receivedAt: '2026-08-10', ...overrides,
  }
  return header.split(',').map((key) => values[key] ?? '').join(',')
}

const parse = (...rows: string[]) => parseFreightRateCsv([header, ...rows].join('\n'))

describe('freight rate import adversarial rules', () => {
  it('parses a valid USD rate sheet row', () => {
    const result = parse(row())
    expect(result.issues).toHaveLength(0)
    expect(result.records[0].rate).toBe(6.5)
  })

  it('rejects non-USD rows rather than silently converting currency', () => {
    const result = parse(row({ currency: 'EUR' }))
    expect(result.records).toHaveLength(0)
    expect(result.issues[0].message).toContain('USD')
  })

  it('rejects mode/unit mismatches', () => {
    const result = parse(row({ mode: 'sea_lcl', rateUnit: 'kg' }))
    expect(result.records).toHaveLength(0)
  })

  it('rejects invalid received dates instead of leaving sort order undefined', () => {
    const result = parse(row({ receivedAt: 'not-a-date' }))
    expect(result.records).toHaveLength(0)
    expect(result.issues[0].message).toContain('receivedAt')
  })

  it('rejects duplicate rate IDs', () => {
    const result = parse(row({ id: 'same' }), row({ id: 'same', provider: 'Forwarder B' }))
    expect(result.records).toHaveLength(1)
    expect(result.issues[0].message).toContain('duplicado')
  })

  it('does not select an expired rate', () => {
    const records = parse(row({ validTo: '2026-08-12' })).records
    expect(selectFreightRate(records, 'air', 'Shanghai', 'Buenos Aires', '2026-08-14')).toBeNull()
  })

  it('does not use a rate that was received after the as-of date', () => {
    const records = parse(row({ receivedAt: '2026-08-20' })).records
    expect(selectFreightRate(records, 'air', 'Shanghai', 'Buenos Aires', '2026-08-14')).toBeNull()
  })

  it('requires an exact normalized lane match', () => {
    const records = parse(row()).records
    expect(selectFreightRate(records, 'air', 'Shanghai', 'Cordoba', '2026-08-14')).toBeNull()
  })

  it('prefers an actual quote over a cheaper benchmark', () => {
    const result = parse(
      row({ id: 'benchmark', provider: 'Cheap Benchmark', rate: '3', sourceType: 'benchmark', receivedAt: '2026-08-13' }),
      row({ id: 'quote', provider: 'Forwarder Quote', rate: '7', sourceType: 'quote', receivedAt: '2026-08-11' }),
    )
    expect(selectFreightRate(result.records, 'air', 'Shanghai', 'Buenos Aires', '2026-08-14')?.record.id).toBe('quote')
  })

  it('prefers the most recently received rate within the same source class', () => {
    const result = parse(
      row({ id: 'old', receivedAt: '2026-08-05' }),
      row({ id: 'new', receivedAt: '2026-08-12', rate: '6.8' }),
    )
    expect(selectFreightRate(result.records, 'air', 'Shanghai', 'Buenos Aires', '2026-08-14')?.record.id).toBe('new')
  })

  it('exposes quote fixed charges but never mutates manual fixed fees', () => {
    const selection = selectFreightRate(parse(row()).records, 'air', 'Shanghai', 'Buenos Aires', '2026-08-14')!
    const applied = applyFreightRate(defaultInputs, selection)
    expect(selection.pendingFixedChargesUsd).toBe(150)
    expect(applied.fixedFeesUsd).toBe(defaultInputs.fixedFeesUsd)
  })

  it('applies only the selected rate and minimum for the chosen mode', () => {
    const selection = selectFreightRate(parse(row()).records, 'air', 'Shanghai', 'Buenos Aires', '2026-08-14')!
    const applied = applyFreightRate(defaultInputs, selection)
    expect(applied.airUsdKg).toBe(6.5)
    expect(applied.airMinimumUsd).toBe(120)
    expect(applied.seaUsdCbm).toBe(defaultInputs.seaUsdCbm)
  })
})
