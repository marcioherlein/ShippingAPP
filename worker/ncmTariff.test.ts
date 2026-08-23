import { describe, expect, it } from 'vitest'
import { lookupNcmTariff, ncmHierarchy, sectionForChapter, type D1DatabaseLike } from './ncmTariff'

function fakeDb(row: Record<string, unknown> | null): D1DatabaseLike {
  return {
    prepare: () => ({
      bind() { return this },
      async first<T>() { return row as T | null },
    }),
  }
}

const meta = {
  source_file: 'Archivo NCM para APP.xlsx',
  source_sha256: 'cf05f7f2571f0bf9de4e23bb37a7e0f48f465524a3710d0aeac23cb48d7b10f3',
  record_count: 10434,
}

describe('NCM tariff D1 engine', () => {
  it('derives hierarchy from the code rather than spreadsheet chapter/section labels', () => {
    expect(ncmHierarchy('9506.59.00')).toEqual({ chapter: '95', heading: '9506', subheading: '9506.59', section: 'XX' })
    expect(sectionForChapter(84)).toBe('XVI')
    expect(sectionForChapter(72)).toBe('XV')
    expect(sectionForChapter(77)).toBe('XV')
  })

  it('returns exact rates for a padel-racket family code', async () => {
    const result = await lookupNcmTariff(fakeDb({ code: '9506.59.00', aec_pct: 20, statistics_pct: 3, iva_pct: 21, status: 'ok', ...meta }), '9506.59.00')
    expect(result.status).toBe('ok')
    expect(result.aecPct).toBe(20)
    expect(result.statisticsPct).toBe(3)
    expect(result.ivaPct).toBe(21)
    expect(result.recordCount).toBe(10434)
  })

  it('does not fall back from a missing exact NCM to a nearby code', async () => {
    const result = await lookupNcmTariff(fakeDb(null), '9506.58.00')
    expect(result.status).toBe('missing')
    expect(result.aecPct).toBeNull()
  })

  it('fails closed for the source conflict 8472.90.20', async () => {
    const result = await lookupNcmTariff(fakeDb({ code: '8472.90.20', aec_pct: null, statistics_pct: null, iva_pct: null, status: 'conflict', ...meta }), '8472.90.20')
    expect(result.status).toBe('conflict')
    expect(result.aecPct).toBeNull()
  })

  it('rejects malformed rates instead of feeding economics', async () => {
    const result = await lookupNcmTariff(fakeDb({ code: '9506.59.00', aec_pct: 120, statistics_pct: 3, iva_pct: 21, status: 'ok', ...meta }), '9506.59.00')
    expect(result.status).toBe('unavailable')
  })

  it('degrades safely when the D1 binding is not configured', async () => {
    const result = await lookupNcmTariff(undefined, '9506.59.00')
    expect(result.status).toBe('unavailable')
    expect(result.source).toContain('binding not configured')
  })
})
