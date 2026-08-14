import { describe, expect, it } from 'vitest'
import { fetchBcraReferenceFx, parseBcraReferenceFx } from './bcraFx'

function payload(detail: any[], fecha = '2026-08-13') {
  return { status: 200, results: { fecha, detalle: detail } }
}

describe('BCRA reference FX', () => {
  it('uses the explicit REF / Comunicación A 3500 quotation', () => {
    const result = parseBcraReferenceFx(payload([
      { codigoMoneda: 'USD', descripcion: 'DOLAR E.E.U.U.', tipoCotizacion: 1492 },
      { codigoMoneda: 'REF', descripcion: 'DOLAR REFERENCIA COM 3500', tipoCotizacion: 1491.8387 },
    ]))
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

  it('returns unavailable on HTTP/network failure with no stale fallback', async () => {
    const result = await fetchBcraReferenceFx(async () => new Response('down', { status: 503 }))
    expect(result.status).toBe('unavailable')
    expect(result.arsPerUsd).toBeNull()
    expect(result.note).toContain('economics queda bloqueado')
  })
})
