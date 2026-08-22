import { beforeEach, describe, expect, it } from 'vitest'
import worker from './enrich'
import { resetNcmDatabaseCacheForTests, type D1DatabaseLike } from './ncmDatabase'
import { resetNcmIndexCacheForTests } from './ncmRetrieval'
import { resetSimCacheForTests } from './simHydration'

function d1Catalog(): Array<{ code: string; official_label: string }> {
  const filler = Array.from({ length: 10000 }, (_, i) => ({
    code: `${String((i % 96) + 1).padStart(2, '0')}01.${String(i % 99).padStart(2, '0')}.${String((i * 7) % 99).padStart(2, '0')}`,
    official_label: `Mercadería técnica de prueba ${i}`,
  }))
  return [
    { code: '8504.40.90', official_label: 'Transformadores eléctricos > Convertidores eléctricos estáticos > Los demás' },
    { code: '8507.60.00', official_label: 'Acumuladores eléctricos > De iones de litio' },
    ...filler,
  ]
}

function d1(): D1DatabaseLike {
  const rows = d1Catalog()
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
          if (sql.includes('FROM ncm_dataset_versions')) {
            return {
              id: 1, source_name: 'ARCA + normalized tariffs', source_file: 'nomenclador_14082026.txt',
              source_date: '2026-08-14', schema_version: 1, record_count: rows.length,
            }
          }
          if (sql.includes('FROM ncm_tariffs') && bound[0] === '8504.40.90') {
            return {
              code: '8504.40.90', aec_pct: 7, statistics_rate_pct: 3, iva_pct: 21, iva_additional_pct: 20,
              source_group_description: 'Convertidores', source_rows: '3010',
              source_name: 'ShippingAPP normalized tariff source', source_file: 'Archivo NCM para APP.xlsx',
            }
          }
          return null
        },
      }
      return stmt
    },
  }
}

function sim85() {
  return {
    meta: { sourceDate: '2026-08-14', simIndexSchema: 1, tariffDataIncluded: false, chapter: '85', recordCount: 1 },
    records: [
      ['8504.40.90', 'Convertidores eléctricos estáticos > Los demás', [
        ['8504.40.90.900Z', 'Los demás'],
      ]],
    ],
  }
}

beforeEach(() => {
  resetNcmDatabaseCacheForTests()
  resetNcmIndexCacheForTests()
  resetSimCacheForTests()
})

describe('/api/ncm-classify with NCM_DB', () => {
  it('uses D1 as the catalog source and returns the exact validated tariff', async () => {
    let staticIndexRequested = false
    let aiCall = 0
    const env: any = {
      NCM_DB: d1(),
      AI: { run: async () => ({ response: JSON.stringify([
        { searchTerms: ['convertidor eléctrico estático', 'fuente de alimentación'], missingFacts: [] },
        { ranking: [{ code: '8504.40.90', reason: 'Convierte CA a CC mediante conversión estática' }], confidence: 'high' },
      ][aiCall++] || {}) }) },
      ASSETS: { fetch: async (request: Request) => {
        const path = new URL(request.url).pathname
        if (path === '/data/ncm-index.json') staticIndexRequested = true
        if (path === '/data/sim/85.json') return new Response(JSON.stringify(sim85()), { status: 200 })
        return new Response('not found', { status: 404 })
      } },
    }

    const response = await worker.fetch(new Request('https://shippingapp.test/api/ncm-classify', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '65W USB-C GaN wall charger', category: 'Power adapter', functionText: 'Converts AC mains to USB-C DC power' }),
    }), env)

    expect(response.status).toBe(200)
    const body: any = await response.json()
    expect(staticIndexRequested).toBe(false)
    expect(body.code).toBe('8504.40.90')
    expect(body.source).toContain('ShippingAPP D1')
    expect(body.tariff.status).toBe('available')
    expect(body.tariff).toMatchObject({ aecPct: 7, statisticsRatePct: 3, ivaPct: 21 })
    expect(body.sim.candidate.code).toBe('8504.40.90.900Z')
  })
})
