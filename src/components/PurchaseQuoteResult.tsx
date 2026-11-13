import { readProductDraft, writeProductDraft } from '../lib/productDraft'
import React, { useEffect, useRef, useState } from 'react'
import type { PurchasePlan, PurchaseCapacity } from '../lib/purchasePlan'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'
import { saveCompletedAnalysis } from '../lib/analysisHistory'
import { ApiAuthError, getSessionState, subscribeSession } from '../lib/authSession'
import { readCaseConversation, type CaseMessage } from '../lib/caseConversation'
import CaseConversation from './CaseConversation'
import { usd } from '../lib/format'
import { minimumScenario, PurchaseOptimization, PurchaseTransportComparison, transportLabels } from './PurchaseDecisionTables'
import QuoteCostBreakdown from './QuoteCostBreakdown'
import UiIcon from './UiIcon'
import { useProcessingScreen } from '../lib/useProcessingScreen'
export type PurchaseQuoteSnapshot = { version: 1; quotedAt: string; analysis: ProductAnalysisV2; pipelineSummary: { baseQuantity: number; selectedMode: string; totalCostUsd: number; unitCostUsd: number; freightCostUsd: number }; purchasePlan: PurchasePlan; conversation: CaseMessage[] }
export const PurchaseQuoteSummary = React.memo(function PurchaseQuoteSummary({ snapshot, onChoose }: { snapshot: PurchaseQuoteSnapshot; onChoose?: (quantity: number) => void }) {
  const { purchasePlan: plan, analysis } = snapshot
  const minimum = minimumScenario(plan)
  const minimumReason = 'minimumReason' in plan ? plan.minimumReason : plan.singleReason
  const selectedTransport = plan.transportOptions?.find(option => option.mode === plan.selected?.mode)
  const selected = plan.selected
  const cost = selected?.cost
  const transit = selectedTransport?.transit
  const origin = analysis.product.originCountry
  const ncm = analysis.customs.ncmCandidate
  const composition: Array<[string, number]> = cost ? [
    ['Mercadería', cost.fobUsd],
    ['Flete y destino', cost.freightCostUsd + cost.fixedDestinationUsd],
    ['Impuestos y tasas', cost.dutyUsd + cost.statisticsUsd + cost.vatUsd + cost.vatAdditionalUsd + cost.gainsUsd + cost.iibbUsd],
    ['Firma e intervenciones', cost.noImporterSignatureUsd + cost.sensitiveCategoryUsd],
  ] : []
  return <>

    <section className="simple-quote purchase-dashboard-summary" aria-label="Tu presupuesto de importación">
      <div className="calculator-result-product">
        <span className="calculator-result-product-icon"><UiIcon name="product" size={21} /></span>
        <div><h2>{analysis.product.name}</h2><p>{[origin && `${origin} → Argentina`, ncm && `NCM ${ncm}`].filter(Boolean).join(' · ')}</p></div>
      </div>
      {selected && <div className="calculator-result-banner">
        <div>
          <span className="calculator-result-label"><UiIcon name="info" size={15} /> Estimación para la cantidad elegida</span>
          <p>{transportLabels[selected.mode]} · {selected.quantity.toLocaleString('es-AR')} u.</p>
        </div>
        <dl className="workspace-result-overview" aria-label="Resumen de la compra">
          <div><dt>Costo puesto por unidad</dt><dd>{usd(selected.cost.unitCostUsd)}</dd></div>
          <div><dt>Inversión total estimada</dt><dd>{usd(selected.cost.totalCostUsd)}</dd></div>
          <div><dt>Plazo de transporte</dt><dd>{transit ? `${transit.minDays}–${transit.maxDays} días ${transit.basis === 'business' ? 'hábiles' : 'corridos'}` : 'A confirmar'}</dd></div>
        </dl>
      </div>}
      <p className="calculator-result-date">Cálculo del {new Date(snapshot.quotedAt).toLocaleString('es-AR')} · Importes en USD</p>
      {selectedTransport?.eligibility === 'requires_quote' && <p className="purchase-conditional-price">Esta carga requiere aceptación y cotización específica del transportista. Los costos mostrados usan tarifas estándar y no incluyen recargos especiales pendientes.</p>}
      {plan.note && <p className="calculator-plan-note">{plan.note}</p>}{plan.error && <p role="alert">{plan.error}</p>}
      <PurchaseTransportComparison plan={plan} />
      <PurchaseOptimization plan={plan} onChoose={onChoose} minimumConfirmed={Boolean(analysis.product.moq)} />
      <section className="quote-scenarios" aria-label="Compra mínima y cantidad elegida"><h3>{analysis.product.moq ? 'Empezá por lo mínimo que podés comprar' : 'Tu compra mínima modelada'}</h3><p>{analysis.product.moq ? 'Respetamos el mínimo del proveedor, el tamaño de los lotes y los tramos de precio confirmados.' : 'MOQ pendiente de confirmar con el proveedor. Este mínimo se modela con el tamaño del lote y los tramos de precio de la oferta.'}</p><div className="simple-quote-grid">
        <article className="simple-quote-card"><h4>{analysis.product.moq ? 'Si traés lo mínimo' : 'Compra mínima modelada'}{minimum ? `: ${minimum.quantity.toLocaleString('es-AR')} ${minimum.quantity === 1 ? 'unidad' : 'unidades'}` : ''}</h4>{minimum ? <><strong>{usd(minimum.cost.unitCostUsd)}</strong><span>USD por unidad · {transportLabels[minimum.mode]}</span><p>Inversión mínima estimada: {usd(minimum.cost.totalCostUsd)}</p>{minimum.withinBudget === false && <p className="purchase-budget-warning">Esta compra mínima supera el presupuesto indicado. Revisá los demás tramos calculados.</p>}</> : <p>{minimumReason || 'Confirmá el mínimo y el precio de la oferta para calcular esta compra.'}</p>}</article>
        {plan.selected && plan.selected.quantity !== minimum?.quantity && <article className="simple-quote-card"><h4>Tu compra: {plan.selected.quantity.toLocaleString('es-AR')} unidades</h4><strong>{usd(plan.selected.cost.unitCostUsd)}</strong><span>USD por unidad · {transportLabels[plan.selected.mode]}</span><p>Total de esta compra: {usd(plan.selected.cost.totalCostUsd)}</p></article>}
      </div></section>
      {cost && selected && <section className="calculator-cost-section" aria-label="Desglose de costos">
        <h3>Desglose de costos</h3>
        <div className="calculator-cost-layout">
          <div className="calculator-cost-composition">
            <h4>{transportLabels[selected.mode]} · {selected.quantity.toLocaleString('es-AR')} u.</h4>
            <p>Peso real {cost.totalWeightKg.toLocaleString('es-AR', { maximumFractionDigits: 2 })} kg · Volumen {cost.totalVolumeCbm.toLocaleString('es-AR', { maximumFractionDigits: 4 })} m³</p>
            <div className="calculator-cost-bar" aria-hidden="true">{composition.map(([label, amount]) => <span key={label} style={{ flexGrow: amount }} />)}</div>
            <dl>{composition.map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{usd(amount)}</dd></div>)}</dl>
          </div>
          <QuoteCostBreakdown cost={cost} quantity={selected.quantity} />
        </div>
      </section>}
      {plan.improvement && plan.selected && plan.improvement.quantity !== plan.selected.quantity && <aside className="case-alert" aria-label="Otra opción de compra">
        <p><b>{plan.improvement.quantity} unidades a {usd(plan.improvement.cost.unitCostUsd)} por unidad.</b> {plan.improvement.mode === plan.selected.mode && Math.abs(plan.improvement.cost.freightCostUsd - plan.selected.cost.freightCostUsd) < 0.005 ? 'Con el mismo costo de flete estimado.' : 'Una alternativa con menor costo unitario.'} Total: {usd(plan.improvement.cost.totalCostUsd)}. Diferencia de desembolso: {usd(plan.improvement.cost.totalCostUsd - plan.selected.cost.totalCostUsd)}.</p>
        {onChoose && <button type="button" className="pipeline-secondary" onClick={() => onChoose(plan.improvement!.quantity)}>Elegir esta cantidad y recalcular</button>}
      </aside>}
      <section className="decision-checklist" aria-label="Antes de comprar"><h3>Tu próximo paso: validar con el proveedor</h3><ul><li>Confirmá que el precio corresponde a la variante y cantidad elegidas.</li><li>Pedí peso y medidas del embalaje final y una cotización vigente del transporte.</li><li>Validá la posición NCM y los requisitos con tu despachante antes de pagar.</li></ul><p>NCM utilizada: <strong>{analysis.customs.ncmCandidate}</strong> · {analysis.customs.source}</p></section>
      {!analysis.product.moq && <p>Mínimo del proveedor sin confirmar. Las cantidades requieren validación comercial.</p>}
      <details className="workspace-price-explainer"><summary>Del precio del proveedor al costo puesto</summary>
      {cost && plan.selected && <section className="decision-explainer" aria-label="Precio y costo por unidad"><h3>Del precio del proveedor al costo en Argentina</h3><p>Embalaje utilizado: {analysis.product.packedWeightKg} kg y {analysis.product.volumeCbm?.toLocaleString('es-AR', { maximumFractionDigits: 8 })} m³ por unidad. Para {plan.selected.quantity} unidades calculamos {(analysis.product.packedWeightKg * plan.selected.quantity).toLocaleString('es-AR', { maximumFractionDigits: 3 })} kg y {((analysis.product.volumeCbm || 0) * plan.selected.quantity).toLocaleString('es-AR', { maximumFractionDigits: 6 })} m³ de carga.</p><div className="decision-metrics"><article><span>Precio de compra · USD/u.</span><strong>{usd(cost.fobUsd / plan.selected.quantity)}</strong><p>Sólo la mercadería del proveedor.</p></article><article><span>Importación · USD/u.</span><strong>{usd((cost.totalCostUsd - cost.fobUsd) / plan.selected.quantity)}</strong><p>Flete, destino, impuestos y gastos incluidos en este cálculo.</p></article><article><span>Costo puesto estimado · USD/u.</span><strong>{usd(cost.unitCostUsd)}</strong><p>La inversión total dividida por {plan.selected.quantity} unidades.</p></article></div><p>El precio de venta lo definís vos. Para evaluar un margen también necesitás comisiones, logística local, gastos de venta y el tratamiento fiscal de tu operación.</p></section>}
      </details>
      <details className="workspace-audit"><summary>Ver historial de datos y cambios</summary><CaseConversation sourceUrl={analysis.sourceUrl} messages={snapshot.conversation} /></details>
      <details><summary>Ver desglose, fuentes y supuestos</summary>
        <p>NCM: {analysis.customs.ncmCandidate} · {analysis.customs.source}</p>
        {analysis.sourceUrl.startsWith('https://') && <a href={analysis.sourceUrl} target="_blank" rel="noreferrer">Publicación del proveedor</a>}
        <p>Oferta: {analysis.product.supplierQuote?.currency} {analysis.product.supplierQuote?.amount} / {analysis.product.supplierQuote?.basis === 'pack' ? 'lote' : 'unidad'} · {analysis.product.supplierQuote?.variant}.</p>
        {analysis.product.supplierQuote?.currency !== 'USD' && <p>Conversión: {analysis.product.supplierQuote?.usdPerCurrency} USD por moneda original · {analysis.product.supplierQuote?.fxSource} · {analysis.product.supplierQuote?.fxDate}.</p>}

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
  useProcessingScreen(state === 'saving', { title: 'Guardando tu presupuesto', detail: 'Estamos guardando el resultado completo en tu cuenta. Esperamos la confirmación del servidor.' })
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
    {state === 'saved' && <p role="status">Disponible en Mis cálculos, con los datos y el historial de esta cotización.</p>}
  </div><PurchaseQuoteSummary snapshot={snapshot} onChoose={onChoose} /></>
}
