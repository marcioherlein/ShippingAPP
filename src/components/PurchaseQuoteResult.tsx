import { readProductDraft, writeProductDraft } from '../lib/productDraft'
import React, { useEffect, useRef, useState } from 'react'
import type { PurchasePlan, PurchaseCapacity } from '../lib/purchasePlan'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'
import { saveCompletedAnalysis } from '../lib/analysisHistory'
import { ApiAuthError, getSessionState, subscribeSession } from '../lib/authSession'
import { readCaseConversation, type CaseMessage } from '../lib/caseConversation'
import CaseConversation from './CaseConversation'
import { usd } from '../lib/format'
import { minimumScenario, PurchaseOptimization, PurchaseTransportComparison } from './PurchaseDecisionTables'
export type PurchaseQuoteSnapshot = { version: 1; quotedAt: string; analysis: ProductAnalysisV2; pipelineSummary: { baseQuantity: number; selectedMode: string; totalCostUsd: number; unitCostUsd: number; freightCostUsd: number }; purchasePlan: PurchasePlan; conversation: CaseMessage[] }
const modes = { lcl: 'Marítimo LCL', air: 'Aéreo', courier: 'Courier comercial' }
export const PurchaseQuoteSummary = React.memo(function PurchaseQuoteSummary({ snapshot, onChoose }: { snapshot: PurchaseQuoteSnapshot; onChoose?: (quantity: number) => void }) {
  const { purchasePlan: plan, analysis } = snapshot
  const minimum = minimumScenario(plan)
  const minimumReason = 'minimumReason' in plan ? plan.minimumReason : plan.singleReason
  const selectedTransport = plan.transportOptions?.find(option => option.mode === plan.selected?.mode)
  const cost = plan.selected?.cost
  const composition: Array<[string, number]> = cost ? [
    ['Mercadería', cost.fobUsd],
    ['Flete y destino', cost.freightCostUsd + cost.fixedDestinationUsd],
    ['Impuestos y tasas', cost.dutyUsd + cost.statisticsUsd + cost.vatUsd + cost.vatAdditionalUsd + cost.gainsUsd + cost.iibbUsd],
    ['Firma e intervenciones', cost.noImporterSignatureUsd + cost.sensitiveCategoryUsd],
  ] : []
  return <>

    <section className="simple-quote purchase-dashboard-summary" aria-label="Tu presupuesto de importación">
      <span className="eyebrow">Panel de decisión · Importación a Argentina</span><h2>{analysis.product.name}</h2>
      {plan.selected && <div className="workspace-result-overview" aria-label="Resumen de la compra"><div><span>Inversión total estimada · USD</span><strong>{usd(plan.selected.cost.totalCostUsd)}</strong></div><div><span>Costo puesto por unidad · USD</span><strong>{usd(plan.selected.cost.unitCostUsd)}</strong></div><div><span>Cantidad elegida</span><strong>{plan.selected.quantity} u.</strong></div><div><span>Modalidad comparada</span><strong>{modes[plan.selected.mode]}</strong></div></div>}
      <p>Cálculo del {new Date(snapshot.quotedAt).toLocaleString('es-AR')}. Fuentes y tarifas corresponden a esta versión del cálculo.</p>
      <p className="workspace-result-note">Estimación para decidir, sujeta a validación comercial y aduanera. Revisá los pendientes antes de comprar.</p>
      {selectedTransport?.eligibility === 'requires_quote' && <p className="purchase-conditional-price">Esta carga requiere aceptación y cotización específica del transportista. Los costos mostrados usan tarifas estándar y no incluyen recargos especiales pendientes.</p>}
      {plan.note && <p>{plan.note}</p>}{plan.error && <p role="alert">{plan.error}</p>}
      <section className="quote-scenarios" aria-label="Compra mínima y cantidad elegida"><h3>{analysis.product.moq ? 'Empezá por lo mínimo que podés comprar' : 'Tu compra mínima modelada'}</h3><p>{analysis.product.moq ? 'Respetamos el mínimo del proveedor, el tamaño de los lotes y los tramos de precio confirmados.' : 'MOQ pendiente de confirmar con el proveedor. Este mínimo se modela con el tamaño del lote y los tramos de precio de la oferta.'}</p><div className="simple-quote-grid">
        <article className="simple-quote-card"><h4>{analysis.product.moq ? 'Si traés lo mínimo' : 'Compra mínima modelada'}{minimum ? `: ${minimum.quantity.toLocaleString('es-AR')} ${minimum.quantity === 1 ? 'unidad' : 'unidades'}` : ''}</h4>{minimum ? <><strong>{usd(minimum.cost.unitCostUsd)}</strong><span>USD por unidad · {modes[minimum.mode]}</span><p>Inversión mínima estimada: {usd(minimum.cost.totalCostUsd)}</p>{minimum.withinBudget === false && <p className="purchase-budget-warning">Esta compra mínima supera el presupuesto indicado. Revisá los demás tramos calculados.</p>}</> : <p>{minimumReason || 'Confirmá el mínimo y el precio de la oferta para calcular esta compra.'}</p>}</article>
        {plan.selected && plan.selected.quantity !== minimum?.quantity && <article className="simple-quote-card"><h4>Tu compra: {plan.selected.quantity.toLocaleString('es-AR')} unidades</h4><strong>{usd(plan.selected.cost.unitCostUsd)}</strong><span>USD por unidad · {modes[plan.selected.mode]}</span><p>Total de esta compra: {usd(plan.selected.cost.totalCostUsd)}</p></article>}
      </div></section>
      {cost && plan.selected && <section className="decision-explainer" aria-label="Precio y costo por unidad"><h3>Del precio del proveedor al costo en Argentina</h3><p>Embalaje utilizado: {analysis.product.packedWeightKg} kg y {analysis.product.volumeCbm?.toLocaleString('es-AR', { maximumFractionDigits: 8 })} m³ por unidad. Para {plan.selected.quantity} unidades calculamos {(analysis.product.packedWeightKg * plan.selected.quantity).toLocaleString('es-AR', { maximumFractionDigits: 3 })} kg y {((analysis.product.volumeCbm || 0) * plan.selected.quantity).toLocaleString('es-AR', { maximumFractionDigits: 6 })} m³ de carga.</p><div className="decision-metrics"><article><span>Precio de compra · USD/u.</span><strong>{usd(cost.fobUsd / plan.selected.quantity)}</strong><p>Sólo la mercadería del proveedor.</p></article><article><span>Importación · USD/u.</span><strong>{usd((cost.totalCostUsd - cost.fobUsd) / plan.selected.quantity)}</strong><p>Flete, destino, impuestos y gastos incluidos en este cálculo.</p></article><article><span>Costo puesto estimado · USD/u.</span><strong>{usd(cost.unitCostUsd)}</strong><p>La inversión total dividida por {plan.selected.quantity} unidades.</p></article></div><p>El precio de venta lo definís vos. Para evaluar un margen también necesitás comisiones, logística local, gastos de venta y el tratamiento fiscal de tu operación.</p></section>}
      <PurchaseOptimization plan={plan} onChoose={onChoose} minimumConfirmed={Boolean(analysis.product.moq)} />
      <PurchaseTransportComparison plan={plan} />
      {plan.selected && new Set([minimum?.quantity,plan.selected.quantity,plan.improvement?.quantity].filter(Boolean)).size > 1 && <section className="decision-comparison" aria-label="Comparación de cantidades"><h3>¿Qué cambia al comprar más?</h3><p>Comparamos escenarios calculados. Un menor costo por unidad puede requerir una inversión total mayor.</p><div className="decision-chart">{[minimum, plan.selected, plan.improvement].filter((item,index,items) => item && items.findIndex(other => other?.quantity === item.quantity) === index).sort((a,b) => (a?.quantity || 0) - (b?.quantity || 0)).map(item => item && <div key={item.quantity}><span>{item.quantity} u.</span><span className="decision-bar" aria-hidden="true"><span style={{width:`${Math.min(100,item.cost.unitCostUsd / Math.max(minimum?.cost.unitCostUsd || 0,plan.selected!.cost.unitCostUsd,plan.improvement?.cost.unitCostUsd || 0) * 100)}%`}} /></span><b>{usd(item.cost.unitCostUsd)} /u.</b><small>Total {usd(item.cost.totalCostUsd)} · {modes[item.mode]}</small></div>)}</div></section>}
      {cost && <section className="workspace-cost-composition" aria-label="Distribución de la inversión"><h3>Cómo se compone tu inversión (USD)</h3><dl>{composition.map(([label,amount]) => <div key={label}><dt>{label}</dt><dd>{usd(amount)}</dd><span className="workspace-cost-track" aria-hidden="true"><span style={{width:`${cost.totalCostUsd > 0 ? Math.min(100,Math.max(0,amount / cost.totalCostUsd * 100)) : 0}%`}} /></span></div>)}</dl></section>}
      {plan.improvement && plan.selected && plan.improvement.quantity !== plan.selected.quantity && <aside className="case-alert" aria-label="Otra opción de compra">
        <p><b>{plan.improvement.quantity} unidades a {usd(plan.improvement.cost.unitCostUsd)} por unidad.</b> {plan.improvement.mode === plan.selected.mode && Math.abs(plan.improvement.cost.freightCostUsd - plan.selected.cost.freightCostUsd) < 0.005 ? 'Con el mismo costo de flete estimado.' : 'Una alternativa con menor costo unitario.'} Total: {usd(plan.improvement.cost.totalCostUsd)}. Diferencia de desembolso: {usd(plan.improvement.cost.totalCostUsd - plan.selected.cost.totalCostUsd)}.</p>
        {onChoose && <button type="button" className="pipeline-secondary" onClick={() => onChoose(plan.improvement!.quantity)}>Elegir esta cantidad y recalcular</button>}
      </aside>}
      <section className="decision-checklist" aria-label="Antes de comprar"><h3>Tu próximo paso: validar con el proveedor</h3><ul><li>Confirmá que el precio corresponde a la variante y cantidad elegidas.</li><li>Pedí peso y medidas del embalaje final y una cotización vigente del transporte.</li><li>Validá la posición NCM y los requisitos con tu despachante antes de pagar.</li></ul><p>NCM utilizada: <strong>{analysis.customs.ncmCandidate}</strong> · {analysis.customs.source}</p></section>
      {!analysis.product.moq && <p>Mínimo del proveedor sin confirmar. Las cantidades requieren validación comercial.</p>}
      <details className="workspace-audit"><summary>Ver historial de datos y cambios</summary><CaseConversation sourceUrl={analysis.sourceUrl} messages={snapshot.conversation} /></details>
      <details><summary>Ver desglose, fuentes y supuestos</summary>
        <p>NCM: {analysis.customs.ncmCandidate} · {analysis.customs.source}</p>
        {analysis.sourceUrl.startsWith('https://') && <a href={analysis.sourceUrl} target="_blank" rel="noreferrer">Publicación del proveedor</a>}
        <p>Oferta: {analysis.product.supplierQuote?.currency} {analysis.product.supplierQuote?.amount} / {analysis.product.supplierQuote?.basis === 'pack' ? 'lote' : 'unidad'} · {analysis.product.supplierQuote?.variant}.</p>
        {analysis.product.supplierQuote?.currency !== 'USD' && <p>Conversión: {analysis.product.supplierQuote?.usdPerCurrency} USD por moneda original · {analysis.product.supplierQuote?.fxSource} · {analysis.product.supplierQuote?.fxDate}.</p>}
        {plan.selected && <dl>{([['Mercadería',plan.selected.cost.fobUsd],['Flete internacional',plan.selected.cost.freightCostUsd],['Derecho',plan.selected.cost.dutyUsd],['Tasa estadística',plan.selected.cost.statisticsUsd],['IVA',plan.selected.cost.vatUsd],['IVA adicional',plan.selected.cost.vatAdditionalUsd],['Ganancias',plan.selected.cost.gainsUsd],['IIBB',plan.selected.cost.iibbUsd],['Gastos de destino',plan.selected.cost.fixedDestinationUsd],['Firma de importador',plan.selected.cost.noImporterSignatureUsd],['Intervención',plan.selected.cost.sensitiveCategoryUsd]] as Array<[string,number]>).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{usd(value)}</dd></div>)}</dl>}
        <p>Fuente de flete: {plan.selected?.cost.source}. El costo de flete es estimado con la tarifa modelada; no constituye una reserva de transporte.</p>
        <p>Mercado argentino: {analysis.market.estimatedPriceArs && analysis.market.estimatedPriceArs > 0 ? 'La evidencia local se conserva en el análisis; este presupuesto no promete rentabilidad.' : 'No hay evidencia suficiente para afirmar rentabilidad.'}</p>
      </details>
    </section>
  </>
})
export default function PurchaseQuoteResult({ analysis, plan, capacity, input, summary, saved, onEdit, onChoose }: { analysis: ProductAnalysisV2; plan: PurchasePlan; capacity: PurchaseCapacity; input: Record<string,unknown>; summary: PurchaseQuoteSnapshot['pipelineSummary']; saved?: PurchaseQuoteSnapshot | null; onEdit: () => void; onChoose: (quantity: number) => void }) {
  const [pending] = useState(() => readProductDraft<{ input: Record<string,unknown>; snapshot: PurchaseQuoteSnapshot }>('pending-quote-save'))
  const pendingMatches = !saved && JSON.stringify(pending?.input) === JSON.stringify({ ...input, capacity }) && pending?.snapshot.analysis.sourceUrl === analysis.sourceUrl && pending.snapshot.pipelineSummary.baseQuantity === summary.baseQuantity && pending.snapshot.pipelineSummary.totalCostUsd === summary.totalCostUsd
  const [saveInput] = useState(() => pendingMatches ? pending!.input : { ...input, capacity })
  const [fingerprint] = useState(() => JSON.stringify({ analysis, summary, input, capacity }))
  const [cached] = useState(() => readProductDraft<{ fingerprint: string; snapshot: PurchaseQuoteSnapshot; persisted?: boolean }>('quote-result'))
  const [snapshot] = useState<PurchaseQuoteSnapshot>(() => saved ?? (pendingMatches ? pending!.snapshot : null) ?? (cached?.fingerprint === fingerprint ? cached.snapshot : null) ?? ({ version: 1, quotedAt: new Date().toISOString(), analysis, pipelineSummary: summary, purchasePlan: plan, conversation: readCaseConversation(analysis.sourceUrl) }))
  const [state, setState] = useState<'idle'|'saving'|'saved'|'error'>(saved || (cached?.fingerprint === fingerprint && cached.persisted) ? 'saved' : 'idle')
  useEffect(() => { writeProductDraft('quote-result', { fingerprint, snapshot, persisted: state === 'saved' }) }, [fingerprint, snapshot, state])
  const [error, setError] = useState('')
  const busy = useRef(false)
  const waiting = useRef(!!pendingMatches)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const save = async () => {
    if (busy.current) return
    busy.current = true; waiting.current = false; setState('saving'); setError('')
    try {
      writeProductDraft('pending-quote-save', { input: saveInput, snapshot })
      await saveCompletedAnalysis(saveInput, snapshot)
      if (readProductDraft<{ snapshot: PurchaseQuoteSnapshot }>('pending-quote-save')?.snapshot.quotedAt === snapshot.quotedAt) writeProductDraft('pending-quote-save', null)
      if (!mounted.current) return
      setState('saved'); window.dispatchEvent(new CustomEvent('shippingapp:history-updated'))
    } catch (cause) {
      if (!mounted.current) return
      waiting.current = cause instanceof ApiAuthError
      setState('error'); setError(cause instanceof Error ? cause.message : 'No pudimos guardar el presupuesto.')
    } finally { busy.current = false }
  }
  const saveRef = useRef(save); saveRef.current = save
  useEffect(() => {
    const resume = () => { if (waiting.current && getSessionState() === 'ready') void saveRef.current() }
    const unsubscribe = subscribeSession(resume)
    resume()
    return unsubscribe
  }, [])
  return <><div className="simple-quote quote-result-actions">
    <button type="button" className="journey-primary-action" disabled={state === 'saving' || state === 'saved'} onClick={() => void save()}>{state === 'saving' ? 'Guardando…' : state === 'saved' ? 'Presupuesto guardado' : 'Guardar presupuesto'}</button>
    <button type="button" className="pipeline-secondary" onClick={onEdit}>{saved ? 'Recalcular con datos y tarifas actuales' : 'Editar ficha'}</button>
    {error && <p role="alert">{error} Conservamos el presupuesto para reintentar.</p>}
    {state === 'saved' && <p role="status">Disponible en Mi cuenta → Historial, con los datos y el historial de esta cotización.</p>}
  </div><PurchaseQuoteSummary snapshot={snapshot} onChoose={onChoose} /></>
}
