import { beforeEach, describe, expect, it } from 'vitest'
import worker from './enrich'
import { resetNcmIndexCacheForTests, type NcmSearchIndex } from './ncmRetrieval'

function bigIndex(): NcmSearchIndex {
  const filler: Array<[string, string]> = Array.from({ length: 10000 }, (_, i) => {
    const code = `${String((i % 96) + 1).padStart(2, '0')}01.${String(i % 99).padStart(2, '0')}.${String((i * 7) % 99).padStart(2, '0')}`
    return [code, `Mercadería técnica de prueba ${i}`]
  })
  return {
    meta: {
      source: 'ARCA Arancel Integrado', sourceFile: 'nomenclador_14082026.txt', sourceDate: '2026-08-14',
      parserSchema: 2, indexSchema: 3, recordCount: 10002, tariffDataIncluded: false,
      simOpeningsIncluded: false, recordShape: '[ncmCode,label]',
    },
    records: [
      ['8504.40.90', 'Transformadores eléctricos > Convertidores eléctricos estáticos > Los demás'],
      ['8507.60.00', 'Acumuladores eléctricos > De iones de litio'],
      ...filler,
    ],
  }
}

function env(index: NcmSearchIndex, aiOutputs: unknown[] = []) {
  let call = 0
  return {
    AI: { run: async () => ({ response: JSON.stringify(aiOutputs[call++] ?? {}) }) },
    ASSETS: { fetch: async () => new Response(JSON.stringify(index), { status: 200, headers: { 'content-type': 'application/json' } }) },
  }
}

beforeEach(() => resetNcmIndexCacheForTests())

describe('/api/ncm-classify', () => {
  it('loads the official asset server-side and returns only the bounded classification result', async () => {
    const request = new Request('https://shippingapp.test/api/ncm-classify', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'USB-C 65W power adapter', category: 'Power adapter' }),
    })
    const response = await worker.fetch(request, env(bigIndex(), [
      { searchTerms: ['convertidor eléctrico estático', 'fuente de alimentación'], missingFacts: [] },
      { ranking: [{ code: '8504.40.90', reason: 'Conversión estática de energía' }], confidence: 'high' },
    ]) as any)
    expect(response.status).toBe(200)
    const body: any = await response.json()
    expect(body.code).toBe('8504.40.90')
    expect(body.catalogRecordCount).toBe(10002)
    expect(body.alternatives.length).toBeLessThanOrEqual(3)
    expect(JSON.stringify(body).length).toBeLessThan(10000)
  })

  it('rejects an empty classification request', async () => {
    const request = new Request('https://shippingapp.test/api/ncm-classify', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })
    const response = await worker.fetch(request, env(bigIndex()) as any)
    expect(response.status).toBe(400)
  })

  it('returns 503 when the NCM asset fails integrity rather than classifying from a broken catalog', async () => {
    const broken = { ...bigIndex(), records: [['8504.40.90', 'Convertidores estáticos']] as Array<[string,string]> }
    const request = new Request('https://shippingapp.test/api/ncm-classify', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'power adapter' }),
    })
    const response = await worker.fetch(request, env(broken) as any)
    expect(response.status).toBe(503)
    const body: any = await response.json()
    expect(body.error).toContain('degradar')
  })
})
