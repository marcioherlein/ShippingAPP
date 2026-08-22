import { beforeEach, describe, expect, it } from 'vitest'
import { loadNcmIndexFromD1, lookupNcmTariff, resetNcmDatabaseCacheForTests, type D1DatabaseLike } from './ncmDatabase'

type Row = Record<string, any>

function mockDb(options: {
  rows?: Array<{ code: string; official_label: string }>
  recordCount?: number
  tariff?: Row | null
} = {}): D1DatabaseLike {
  const rows = options.rows || Array.from({ length: 10002 }, (_, i) => ({
    code: `${String((i % 96) + 1).padStart(2, '0')}01.${String(i % 99).padStart(2, '0')}.${String((i * 7) % 99).padStart(2, '0')}`,
    official_label: i === 10 ? '' : `Mercadería técnica ${i}`,
  }))
  const version = {
    id: 7,
    source_name: 'ARCA Arancel Integrado',
    source_file: 'nomenclador_14082026.txt',
    source_date: '2026-08-14',
    schema_version: 1,
    record_count: options.recordCount ?? rows.length,
  }

  return {
    prepare(sql: string) {
      let bound: unknown[] = []
      const stmt: any = {
        bind(...values: unknown[]) { bound = values; return stmt },
        async all() {
          if (sql.includes('FROM ncm_codes')) return { success: true, results: rows }
          return { success: true, results: [] }
        },
        async first() {
          if (sql.includes('FROM ncm_dataset_versions')) return version
          if (sql.includes('FROM ncm_tariffs')) {
            if (options.tariff === undefined) {
              return bound[0] === '8504.40.90' ? {
                code: '8504.40.90', aec_pct: 7, statistics_rate_pct: 3, iva_pct: 21, iva_additional_pct: 20,
                source_group_description: 'Convertidores', source_rows: '3010',
                source_name: 'ShippingAPP normalized tariff source', source_file: 'Archivo NCM para APP.xlsx',
              } : null
            }
            return options.tariff
          }
          return null
        },
      }
      return stmt
    },
  }
}

beforeEach(() => resetNcmDatabaseCacheForTests())

describe('D1 NCM repository', () => {
  it('loads the complete active catalog and preserves official rows with empty labels', async () => {
    const db = mockDb()
    const index = await loadNcmIndexFromD1(db)
    expect(index.records).toHaveLength(10002)
    expect(index.records[10][1]).toBe('')
    expect(index.meta.tariffDataIncluded).toBe(true)
    expect(index.meta.source).toContain('ShippingAPP D1')
  })

  it('rejects a truncated active dataset instead of silently classifying from it', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ code: `0101.${String(i).padStart(2, '0')}.00`, official_label: `Test ${i}` }))
    await expect(loadNcmIndexFromD1(mockDb({ rows, recordCount: 10000 }))).rejects.toThrow('integrity')
  })

  it('returns the exact validated tariff row for the selected NCM', async () => {
    const result = await lookupNcmTariff(mockDb(), '8504.40.90')
    expect(result.status).toBe('available')
    if (result.status !== 'available') throw new Error('expected tariff')
    expect(result.aecPct).toBe(7)
    expect(result.statisticsRatePct).toBe(3)
    expect(result.ivaPct).toBe(21)
    expect(result.source).toContain('Archivo NCM para APP.xlsx')
  })

  it('fails closed when a code has no validated tariff row', async () => {
    const result = await lookupNcmTariff(mockDb({ tariff: null }), '8472.90.20')
    expect(result.status).toBe('not_found')
    expect(result.reason).toContain('Conflicting rows fail closed')
  })

  it('keeps classification usable when D1 is not bound but labels tariff as not configured', async () => {
    const result = await lookupNcmTariff(undefined, '9506.59.00')
    expect(result.status).toBe('not_configured')
  })
})
