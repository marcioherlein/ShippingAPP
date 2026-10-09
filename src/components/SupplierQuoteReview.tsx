import type { SupplierEvidence } from '../lib/supplierEvidence'
import type { SupplierQuote } from '../lib/supplierQuote'
import { supplierQuotePrice } from '../lib/supplierQuote'
import { CURRENCY_LABELS, type CurrencyCode } from '../lib/currency'
import DsSelect from './DsSelect'
import { usd } from '../lib/format'

export default function SupplierQuoteReview({ quote, quantity, sourceUrl, evidence, onChange }: { quote: SupplierQuote; quantity?: number; sourceUrl: string; evidence?: SupplierEvidence; onChange: (quote: SupplierQuote) => void }) {
  const set = <K extends keyof SupplierQuote>(key: K, value: SupplierQuote[K]) => onChange({ ...quote, [key]: value })
  const price = supplierQuotePrice(quote, quantity)
  return <section className="supplier-review" aria-label="Confirmación del precio del proveedor">
    <h3>Revisá la oferta del proveedor</h3>
    <p>Confirmá moneda, variante y si el importe es por unidad o lote. Un símbolo $ solo no identifica la moneda.</p>
    {sourceUrl.startsWith('https://') ? <a href={sourceUrl} target="_blank" rel="noreferrer">Ver publicación original</a> : <p>Fuente: datos ingresados manualmente.</p>}
    {evidence && <p className="supplier-original-evidence">Oferta original: {evidence.priceText || 'Importe sin texto disponible'} · Moneda: {evidence.currency || 'sin identificar'} · Unidad: {evidence.quantityUnit || 'sin identificar'} · Variante: {evidence.variant || 'sin identificar'}{evidence.priceSource && ` · Fuente: ${evidence.priceSource}`}</p>}
    {evidence && <dl className="supplier-original-evidence" aria-label="Evidencia original de logística">
      <dt>Peso original del proveedor</dt><dd>{evidence.weightText || 'Sin dato original'}{evidence.weightSource && ` · ${evidence.weightSource}`}</dd>
      <dt>Mínimo original del proveedor (MOQ)</dt><dd>{evidence.moqText || 'Sin dato original'}{evidence.moqSource && ` · ${evidence.moqSource}`}</dd>
      <dt>Volumen o medidas originales</dt><dd>{evidence.volumeText || 'Sin dato original'}{evidence.volumeSource && ` · ${evidence.volumeSource}`}</dd>
    </dl>}
    <div className="pipeline-progressive-fields">
      <label className="pipeline-confirm-field"><span>Precio en moneda original</span><input type="number" min="0" step="any" value={quote.amount || ''} onChange={e => set('amount', Number(e.target.value))} /></label>
      <label className="pipeline-confirm-field"><span>Moneda original</span><DsSelect ariaLabel="Moneda original" value={quote.currency} onChange={v => set('currency', v as CurrencyCode)} options={[{value:'',label:'Elegí la moneda'}, ...Object.entries(CURRENCY_LABELS).map(([value,label]) => ({value,label:`${value} · ${label}`}))]} /></label>
      <label className="pipeline-confirm-field"><span>Precio por</span><DsSelect ariaLabel="Precio por" value={quote.basis} onChange={v => set('basis', v as SupplierQuote['basis'])} options={[{value:'',label:'Elegí unidad o lote'},{value:'unit',label:'Una unidad'},{value:'pack',label:'Lote / caja'}]} /></label>
      {quote.basis === 'pack' && <label className="pipeline-confirm-field"><span>Unidades por lote</span><input type="number" min="1" step="1" value={quote.unitsPerPack || ''} onChange={e => set('unitsPerPack', Number(e.target.value))} /></label>}
      <label className="pipeline-confirm-field"><span>Variante / modelo confirmado</span><input value={quote.variant} onChange={e => set('variant', e.target.value)} placeholder="Modelo, medida o color de esta oferta" /></label>
      <label className="pipeline-confirm-field"><span>Precio válido desde (unidades)</span><input type="number" min="1" step="1" value={quote.minQuantity || ''} onChange={e => set('minQuantity', Number(e.target.value))} /></label>
      <label className="pipeline-confirm-field"><span>Precio válido hasta (opcional)</span><input type="number" min="1" step="1" value={quote.maxQuantity ?? ''} onChange={e => set('maxQuantity', e.target.value ? Number(e.target.value) : null)} placeholder="Sin límite, sólo si el proveedor lo confirma" /></label>
      {(quote.additionalTiers || []).map((tier, index) => <fieldset key={index} className="supplier-tier">
        <legend>Tramo adicional {index + 1} · misma variante y moneda</legend>
        {(['amount', 'minQuantity', 'maxQuantity'] as const).map(key => <label className="pipeline-confirm-field" key={key}><span>{key === 'amount' ? 'Importe original del tramo' : key === 'minQuantity' ? 'Desde (unidades)' : 'Hasta (opcional)'}</span><input type="number" min="0" step={key === 'amount' ? 'any' : '1'} value={tier[key] ?? ''} onChange={e => set('additionalTiers', (quote.additionalTiers || []).map((item, i) => i === index ? { ...item, [key]: key === 'maxQuantity' && !e.target.value ? null : Number(e.target.value) } : item))} /></label>)}
        <button type="button" className="pipeline-secondary" onClick={() => set('additionalTiers', quote.additionalTiers!.filter((_, i) => i !== index))}>Quitar tramo {index + 1}</button>
      </fieldset>)}
      <button type="button" className="pipeline-secondary" onClick={() => set('additionalTiers', [...(quote.additionalTiers || []), { amount: 0, minQuantity: 0, maxQuantity: null }])}>Agregar otro tramo de precio confirmado</button>
      {quote.currency && quote.currency !== 'USD' && <>
        <label className="pipeline-confirm-field"><span>USD por 1 {quote.currency}</span><input type="number" min="0" step="any" value={quote.usdPerCurrency || ''} onChange={e => set('usdPerCurrency', Number(e.target.value))} /></label>
        <label className="pipeline-confirm-field"><span>Fuente del tipo de cambio</span><input value={quote.fxSource} onChange={e => set('fxSource', e.target.value)} placeholder={quote.currency === 'ARS' ? 'Referencia oficial BCRA (ARS por USD invertido)' : 'Fuente del cruce de esta moneda a USD'} /></label>
        <label className="pipeline-confirm-field"><span>Fecha del tipo de cambio</span><input type="date" value={quote.fxDate} onChange={e => set('fxDate', e.target.value)} /></label>
        <p>Para ARS, usá la referencia oficial documentada. Para otras monedas, usá su cruce a USD; no apliques el tipo de cambio argentino.</p>
      </>}
    </div>
    <p>Los valores detectados se usan sólo después de confirmar la ficha. Podés corregir moneda, precio, peso y MOQ en esta misma revisión.</p>
    <p role="status">{price === null ? 'Falta confirmar la oferta o su precio no cubre la cantidad elegida. Los tramos deben tener límites sin superponerse.' : `Vista previa del precio unitario: ${usd(price)}${quote.currency !== 'USD' ? ` · Fuente: ${quote.fxSource} · ${quote.fxDate}` : ' · USD, sin conversión'}`}</p>
  </section>
}
