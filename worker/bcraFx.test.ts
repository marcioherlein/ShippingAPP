import { describe, expect, it } from 'vitest'
import { fetchBcraReferenceFx, parseBcraReferenceFx } from './bcraFx'

function payload(detail: any[], fecha = '2026-08-13') {
  return { status: 200, results: { fecha, detalle: detail } }
}

const validDetail = [
  { codigoMoneda: 'USD', descripcion: 'DOLAR E.E.U.U.', tipoCotizacion: 1492 },
  { codigoMoneda: 'REF', descripcion: 'DOLAR REFERENCIA COM 3500', tipoCotizacion: 1491.8387 },
]

function mockFetch(ok: boolean, body: unknown = {}) {
  return async () => new Response(JSON.stringify(body), { status: ok ? 200 : 503 })
}

function mockDb(cached: { ars_per_usd: number; source_date: string; fetched_at: string } | null) {
  const writes: unknown[] = []
  return {
    prepare: (sql: string) => ({
      bind: (..._: unknown[]) => ({
        first: () => Promise.resolve(sql.includes('SELECT') ? cached : null),
        run: () => { writes.push(sql); return Promise.resolve({ success: true }) },
      }),
    }),
    writes,
  } as any
}

describe('BCRA reference FX', () => {
  it('uses the explicit REF / Comunicación A 3500 quotation', () => {
    const result = parseBcraReferenceFx(payload(validDetail.slice(1)))
    expect(result.status).toBe('live')
    expect(result.arsPerUsd).toBe(1491.8387)
    expect(result.sourceDate).toBe('2026-08-13')
    expect(result.code).toBe('REF')
  })

  it('does not silently fall back to generic USD if REF is absent', () => {
    const result = parseBcraReferenceFx(payload([
      { codigoMoneda: 'USD', descripcion: 'DOLAR E.E.U.U.', tipoCotizacion: 1492 },
    ]))
    expect(result.status).toBe('unavailable')
    expect(result.arsPerUsd).toBeNull()
    expect(result.note).toContain('no se hace fallback')
  })

  it('rejects zero, negative and non-numeric REF values', () => {
    for (const value of [0, -1, 'not-a-number']) {
      const result = parseBcraReferenceFx(payload([
        { codigoMoneda: 'REF', descripcion: 'DOLAR REFERENCIA COM 3500', tipoCotizacion: value },
      ]))
      expect(result.status).toBe('unavailable')
      expect(result.arsPerUsd).toBeNull()
    }
  })

  it('rejects malformed payload/date instead of inventing freshness', () => {
    expect(parseBcraReferenceFx({ status: 200, results: { fecha: null, detalle: [] } }).sourceDate).toBeNull()
    expect(parseBcraReferenceFx(payload([], '13/08/2026')).status).toBe('unavailable')
  })

  it('returns unavailable on HTTP failure when no DB is provided', async () => {
    const result = await fetchBcraReferenceFx(mockFetch(false))
    expect(result.status).toBe('unavailable')
    expect(result.arsPerUsd).toBeNull()
    expect(result.note).toContain('economics queda bloqueado')
  })

  it('writes the rate to D1 on a successful live fetch', async () => {
    const db = mockDb(null)
    const result = await fetchBcraReferenceFx(mockFetch(true, payload(validDetail)), db)
    expect(result.status).toBe('live')
    expect(result.arsPerUsd).toBe(1491.8387)
    expect(db.writes.length).toBeGreaterThan(0)
  })

  it('returns the cached rate when BCRA is down and a snapshot exists in D1', async () => {
    const db = mockDb({ ars_per_usd: 1480, source_date: '2026-08-12', fetched_at: '2026-08-12T12:00:00Z' })
    const result = await fetchBcraReferenceFx(mockFetch(false), db)
    expect(result.status).toBe('live')
    expect(result.arsPerUsd).toBe(1480)
    expect(result.sourceDate).toBe('2026-08-12')
    expect(result.source).toContain('caché')
    expect(result.note).toContain('última tasa registrada')
  })

  it('falls back to unavailable when BCRA is down and D1 has no snapshot', async () => {
    const db = mockDb(null)
    const result = await fetchBcraReferenceFx(mockFetch(false), db)
    expect(result.status).toBe('unavailable')
    expect(result.arsPerUsd).toBeNull()
  })
})
