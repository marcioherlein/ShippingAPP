import { useState } from 'react'
import { fetchSupplierOfficialFx, fetchSupplierCrossRate, supplierUnitUsd, type SupplierPrice } from '../lib/supplierPrice'
import type { FxEvidence } from '../lib/productAnalysis'
import { usd } from '../lib/format'
type Props = { value: SupplierPrice; fx?: FxEvidence; sourceUrl: string; onChange: (value: SupplierPrice) => void }
export default function SupplierPriceReview({ value, fx, sourceUrl, onChange }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const update = (next: Partial<SupplierPrice>) => { setError(''); onChange({ ...value, ...next }) }
  fx = value.officialFx || fx
  const converted = supplierUnitUsd(value, fx)
  const loadRate = async () => {
    setLoading(true); setError('')
    try { update(value.currency === 'ARS' ? { officialFx: await fetchSupplierOfficialFx() } : { crossRate: await fetchSupplierCrossRate(value.currency) }) }
    catch (e) { setError(e instanceof Error ? e.message : 'No pudimos verificar la moneda.') }
    finally { setLoading(false) }
  }
  return <fieldset className="supplier-price-review" disabled={loading}>
    <legend>Precio y presentación del proveedor</legend>
    <p>Contrastá estos datos con la publicación. Un símbolo $ solo no identifica la moneda.</p>
    {sourceUrl.startsWith('https://') && <a href={sourceUrl} target="_blank" rel="noreferrer">Ver publicación original</a>}
    <div className="pipeline-progressive-fields">
      <label className="pipeline-confirm-field"><span>Precio original del proveedor</span><input type="number" min="0" step="any" value={value.amount || ''} onChange={e => update({ amount: Number(e.target.value) })} /></label>
      <label className="pipeline-confirm-field"><span>Moneda original</span><select value={value.currency} onChange={e => update({ currency: e.target.value, crossRate: undefined })}><option value="">Confirmar moneda</option>{['USD','ARS','EUR','CNY','BRL','GBP','JPY','HKD'].map(c => <option key={c}>{c}</option>)}</select></label>
      <label className="pipeline-confirm-field"><span>Unidades incluidas en ese precio</span><input type="number" min="1" step="1" value={value.unitsPerPack || ''} onChange={e => update({ unitsPerPack: Number(e.target.value) })} /><small>1 para precio unitario; para un pack, su contenido.</small></label>
      <label className="pipeline-confirm-field"><span>Variante / modelo / presentación</span><input value={value.variant} onChange={e => update({ variant: e.target.value })} placeholder="Indicá la variante o escribí única" /></label>
      <label className="pipeline-confirm-field"><span>Este precio aplica desde (unidades)</span><input type="number" min="1" step="1" value={value.minQuantity || ''} onChange={e => update({ minQuantity: Number(e.target.value) })} /></label>
      <label className="pipeline-confirm-field"><span>Hasta (vacío si no hay límite)</span><input type="number" min="1" step="1" value={value.maxQuantity || ''} onChange={e => update({ maxQuantity: Number(e.target.value) || undefined })} /></label>
    </div>
    {value.currency === 'ARS' && <button type="button" disabled={loading} onClick={() => void loadRate()}>{loading ? 'Consultando BCRA…' : 'Actualizar referencia oficial'}</button>}
    {value.currency === 'ARS' && <p>Referencia oficial BCRA A 3500: {fx?.status === 'live' ? `${fx.arsPerUsd} ARS por USD · ${fx.sourceDate}. Dividimos el importe en pesos por esta cotización.` : 'Pendiente. No convertimos sin una cotización oficial vigente.'}</p>}
    {value.currency && !['USD', 'ARS'].includes(value.currency) && <><button type="button" disabled={loading} onClick={() => void loadRate()}>{loading ? 'Consultando cotización…' : 'Verificar conversión a USD'}</button>{value.crossRate && <p>1 {value.currency} = {value.crossRate.usdPerCurrency} USD · BCE · {value.crossRate.date} · <a href={value.crossRate.source} target="_blank" rel="noreferrer">Fuente</a></p>}</>}
    <p role="status">{converted ? `Precio por unidad: ${usd(converted)}` : 'Confirmá importe, moneda y presentación para obtener el precio en USD.'}</p>
    {error && <p role="alert">{error}</p>}
  </fieldset>
}
