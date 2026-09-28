import type { FxEvidence } from './productAnalysis'
export type SupplierPrice = {
  officialFx?: FxEvidence
  amount: number
  currency: string
  unitsPerPack: number
  variant: string
  minQuantity: number
  maxQuantity?: number
  crossRate?: { currency: string; usdPerCurrency: number; date: string; source: string }
}
export function supplierUnitUsd(price: SupplierPrice, fx?: FxEvidence, now = Date.now()): number | null {
  if (!(price.amount > 0) || !Number.isFinite(price.amount) || !Number.isInteger(price.unitsPerPack) || price.unitsPerPack < 1) return null
  fx = price.officialFx || fx
  const fresh = (date: string | null) => !!date && /^\d{4}-\d{2}-\d{2}$/.test(date) && now - Date.parse(date) >= -86400000 && now - Date.parse(date) <= 10 * 86400000
  let rate: number
  if (price.currency === 'USD') rate = 1
  else if (price.currency === 'ARS') {
    if (fx?.status !== 'live' || fx.code !== 'REF' || !fresh(fx.sourceDate) || !(Number(fx.arsPerUsd) > 0)) return null
    rate = 1 / Number(fx.arsPerUsd)
  } else {
    const cross = price.crossRate
    if (!cross || cross.currency !== price.currency || !fresh(cross.date) || !(cross.usdPerCurrency > 0) || !cross.source.startsWith('https://api.frankfurter.dev/v2/providers/ecb/')) return null
    rate = cross.usdPerCurrency
  }
  const value = price.amount * rate / price.unitsPerPack
  return Number.isFinite(value) && value > 0 ? value : null
}
export function supplierTierMatches(price: SupplierPrice, quantity: number) {
  return Number.isInteger(price.minQuantity) && price.minQuantity > 0 && (!price.maxQuantity || (Number.isInteger(price.maxQuantity) && price.maxQuantity >= price.minQuantity)) && Number.isInteger(quantity) && quantity > 0 && Number.isInteger(price.unitsPerPack) && price.unitsPerPack > 0 && quantity % price.unitsPerPack === 0 && quantity >= price.minQuantity && (!price.maxQuantity || quantity <= price.maxQuantity)
}
export async function fetchSupplierCrossRate(currency: string): Promise<NonNullable<SupplierPrice['crossRate']>> {
  if (!['EUR', 'CNY', 'BRL', 'GBP', 'JPY', 'HKD'].includes(currency)) throw new Error('Elegí una moneda respaldada o pedí al proveedor un precio en USD.')
  const source = `https://api.frankfurter.dev/v2/providers/ecb/rate/${currency.toLowerCase()}/usd`
  const response = await fetch(source, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('No pudimos verificar la cotización. Reintentá o pedí un precio en USD al proveedor.')
  const data = await response.json()
  if (String(data.base).toUpperCase() !== currency || String(data.quote).toUpperCase() !== 'USD' || !Number.isFinite(data.rate) || data.rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error('La fuente no devolvió una cotización válida.')
  return { currency, usdPerCurrency: data.rate, date: data.date, source }
}

export async function fetchSupplierOfficialFx(): Promise<FxEvidence> {
  const response = await fetch('https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones', { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('No pudimos consultar la cotización oficial. Reintentá más tarde.')
  const data = await response.json()
  const item = data?.results?.detalle?.find((row: { codigoMoneda?: string }) => row.codigoMoneda === 'REF')
  if (data.status !== 200 || !/3500/.test(item?.descripcion || '') || !(Number(item?.tipoCotizacion) > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(data?.results?.fecha || '')) throw new Error('No hay una referencia oficial válida disponible.')
  return { status: 'live', arsPerUsd: Number(item.tipoCotizacion), sourceDate: data.results.fecha, source: 'BCRA · Dólar Referencia Comunicación A 3500', code: 'REF', note: 'Referencia oficial para conversión de precios; no sustituye la valoración aduanera.' }
}
