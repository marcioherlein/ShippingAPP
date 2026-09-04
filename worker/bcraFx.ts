export type BcraFxResult = {
  status: 'live' | 'unavailable'
  arsPerUsd: number | null
  sourceDate: string | null
  source: string
  code: 'REF'
  note: string
}

import type { D1DatabaseLike } from './persistence/d1'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const ENDPOINT = 'https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones'

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function parseBcraReferenceFx(payload: unknown): BcraFxResult {
  const body = payload as any
  const date = body?.results?.fecha
  const detail = body?.results?.detalle
  if (body?.status !== 200 || !validDate(date) || !Array.isArray(detail)) {
    return {
      status: 'unavailable', arsPerUsd: null, sourceDate: validDate(date) ? date : null,
      source: 'BCRA · Estadísticas Cambiarias', code: 'REF',
      note: 'Respuesta BCRA inválida o incompleta; no se usa un FX alternativo.',
    }
  }

  const reference = detail.find((item: any) => item?.codigoMoneda === 'REF')
  const rate = Number(reference?.tipoCotizacion)
  const label = typeof reference?.descripcion === 'string' ? reference.descripcion.toUpperCase() : ''
  if (!reference || !Number.isFinite(rate) || rate <= 0 || !label.includes('REFERENCIA') || !label.includes('3500')) {
    return {
      status: 'unavailable', arsPerUsd: null, sourceDate: date,
      source: 'BCRA · Estadísticas Cambiarias', code: 'REF',
      note: 'No se encontró una cotización REF / Comunicación A 3500 utilizable; no se hace fallback silencioso a USD.',
    }
  }

  return {
    status: 'live', arsPerUsd: rate, sourceDate: date,
    source: 'BCRA · Dólar Referencia Comunicación A 3500', code: 'REF',
    note: 'FX oficial de referencia usado para screening económico; no representa necesariamente el tipo de cambio transaccional final del importador.',
  }
}

export async function fetchBcraReferenceFx(
  fetchImpl: FetchLike = fetch,
  db?: D1DatabaseLike | null,
): Promise<BcraFxResult> {
  try {
    const response = await fetchImpl(ENDPOINT, {
      headers: { accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`BCRA HTTP ${response.status}`)
    const result = parseBcraReferenceFx(await response.json())
    if (result.status === 'live' && result.arsPerUsd !== null && result.sourceDate && db) {
      await db.prepare(
        'INSERT OR REPLACE INTO fx_snapshots (code, ars_per_usd, source_date, fetched_at) VALUES (?, ?, ?, ?)',
      ).bind('REF', result.arsPerUsd, result.sourceDate, new Date().toISOString()).run().catch(() => undefined)
    }
    return result
  } catch (error) {
    if (db) {
      const cached = await db.prepare(
        'SELECT ars_per_usd, source_date, fetched_at FROM fx_snapshots WHERE code = ?',
      ).bind('REF').first<{ ars_per_usd: number; source_date: string; fetched_at: string }>().catch(() => null)
      if (cached && Number.isFinite(cached.ars_per_usd) && cached.ars_per_usd > 0) {
        return {
          status: 'live',
          arsPerUsd: cached.ars_per_usd,
          sourceDate: cached.source_date,
          source: 'BCRA · Dólar Referencia Comunicación A 3500 (caché)',
          code: 'REF',
          note: `BCRA no disponible (${error instanceof Error ? error.message : 'unknown error'}); se usa la última tasa registrada del ${cached.source_date}. Puede no reflejar el tipo de cambio actual.`,
        }
      }
    }
    return {
      status: 'unavailable', arsPerUsd: null, sourceDate: null,
      source: 'BCRA · Estadísticas Cambiarias', code: 'REF',
      note: `BCRA no disponible (${error instanceof Error ? error.message : 'unknown error'}); economics queda bloqueado y no se reutiliza una tasa anterior.`,
    }
  }
}
