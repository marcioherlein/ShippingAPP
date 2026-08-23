import { describe, expect, it } from 'vitest'
import { lookupTariffInShard, ncmHierarchy, sectionForChapter, type NcmTariffShard } from './ncmTariff'

const shard: NcmTariffShard = {
  meta: {
    sourceFile: 'Archivo NCM para APP.xlsx', sourceSha256: 'test-sha', schemaVersion: 1,
    sourceRows: 3808, occurrences: 10435, recordCount: 10434, conflictCount: 1,
  },
  prefix: '9',
  records: [
    ['9506.59.00', 20, 3, 21],
    ['9405.21.00', 18, 3, 21],
    ['9019.10.00', 7, 3, 21],
  ],
}

describe('NCM tariff snapshot', () => {
  it('derives hierarchy from the NCM itself rather than spreadsheet labels', () => {
    expect(ncmHierarchy('9506.59.00')).toEqual({ chapter: '95', heading: '9506', subheading: '9506.59', section: 'XX' })
    expect(sectionForChapter(84)).toBe('XVI')
    expect(sectionForChapter(72)).toBe('XV')
    expect(sectionForChapter(77)).toBe('XV')
  })

  it('returns exact rates for a padel-racket family code', () => {
    const result = lookupTariffInShard(shard, '9506.59.00')
    expect(result.status).toBe('ok')
    expect(result.aecPct).toBe(20)
    expect(result.statisticsPct).toBe(3)
    expect(result.ivaPct).toBe(21)
  })

  it('does not fall back from a missing exact NCM to a nearby code', () => {
    const result = lookupTariffInShard(shard, '9506.58.00')
    expect(result.status).toBe('missing')
    expect(result.aecPct).toBeNull()
  })

  it('fails closed when the normalized source has a tariff conflict', () => {
    const conflict: NcmTariffShard = { ...shard, prefix: '8', records: [['8472.90.20', null, null, null]] }
    const result = lookupTariffInShard(conflict, '8472.90.20')
    expect(result.status).toBe('conflict')
    expect(result.aecPct).toBeNull()
  })

  it('rejects malformed snapshot rates instead of feeding economics', () => {
    const bad = { ...shard, records: [['9506.59.00', 120, 3, 21]] as any }
    expect(lookupTariffInShard(bad, '9506.59.00').status).toBe('unavailable')
  })
})
