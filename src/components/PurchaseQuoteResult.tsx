import { readProductDraft, writeProductDraft } from '../lib/productDraft'
import React, { useEffect, useRef, useState } from 'react'
import type { PurchasePlan, PurchaseCapacity } from '../lib/purchasePlan'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'
import { saveCompletedAnalysis } from '../lib/analysisHistory'
import { ApiAuthError, getSessionState, subscribeSession } from '../lib/authSession'
import { readCaseConversation, type CaseMessage } from '../lib/caseConversation'
import CaseConversation from './CaseConversation'
import { usd } from '../lib/format'
export type PurchaseQuoteSnapshot = { version: 1; quotedAt: string; analysis: ProductAnalysisV2; pipelineSummary: { baseQuantity: number; selectedMode: string; totalCostUsd: number; unitCostUsd: number; freightCostUsd: number }; purchasePlan: PurchasePlan; conversation: CaseMessage[] }
const modes = { lcl: 'Marítimo LCL', air: 'Aéreo', courier: 'Courier comercial' }
export function PurchaseQuoteSummary({ snapshot, onChoose }: { snapshot: PurchaseQuoteSnapshot; onChoose?: (quantity: number) => void }) {
  const { purchasePlan: plan, analysis } = snapshot
  return <>
    <CaseConversation sourceUrl={analysis.sourceUrl} messages={snapshot.conversation} />
    <section className="simple-quote" aria-label="Tu presupuesto de importación">
      <h2>{analysis.product.name}</h2><p>Cotización del {new Date(snapshot.quotedAt).toLocaleString('es-AR')}. Las tarifas corresponden a esta versión guardada del cálculo.</p>
      {plan.note && <p>{plan.note}</p>}{plan.error && <p role="alert">{plan.error}</p>}
      <div className="simple-quote-grid">
        <article className="simple-quote-card"><h3>Si traés una unidad</h3>{plan.single ? <><strong>{usd(plan.single.cost.unitCostUsd)}</strong><span>por unidad · {modes[plan.single.mode]}</span></> : <p>{plan.singleReason}</p>}</article>
        {plan.selected && plan.selected.quantity !== 1 && <article className="simple-quote-card"><h3>Si traés {plan.selected.quantity} unidades</h3><strong>{usd(plan.selected.cost.unitCostUsd)}</strong><span>por unidad · {modes[plan.selected.mode]}</span><p>Total de esta compra: {usd(plan.selected.cost.totalCostUsd)}</p></article>}
      </div>
      {plan.improvement && plan.selected && plan.improvement.quantity !== plan.selected.quantity && <aside className="case-alert" aria-label="Otra opción de compra">
        <p><b>{plan.improvement.quantity} unidades a {usd(plan.improvement.cost.unitCostUsd)} por unidad.</b> {plan.improvement.mode === plan.selected.mode && Math.abs(plan.improvement.cost.freightCostUsd - plan.selected.cost.freightCostUsd) < 0.005 ? 'Con el mismo costo de flete estimado.' : 'Una alternativa con menor costo unitario.'} Total: {usd(plan.improvement.cost.totalCostUsd)}. Diferencia de desembolso: {usd(plan.improvement.cost.totalCostUsd - plan.selected.cost.totalCostUsd)}.</p>
        {onChoose && <button type="button" className="pipeline-secondary" onClick={() => onChoose(plan.improvement!.quantity)}>Elegir esta cantidad y recalcular</button>}
      </aside>}
      {!analysis.product.moq && <p>Mínimo del proveedor sin confirmar. Las cantidades requieren validación comercial.</p>}
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
}
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
  return <><PurchaseQuoteSummary snapshot={snapshot} onChoose={onChoose} /><div className="simple-quote">
    <button type="button" className="journey-primary-action" disabled={state === 'saving' || state === 'saved'} onClick={() => void save()}>{state === 'saving' ? 'Guardando…' : state === 'saved' ? 'Presupuesto guardado' : 'Guardar presupuesto'}</button>
    <button type="button" className="pipeline-secondary" onClick={onEdit}>{saved ? 'Recalcular con datos y tarifas actuales' : 'Editar respuestas'}</button>
    {error && <p role="alert">{error} Conservamos el presupuesto para reintentar.</p>}
    {state === 'saved' && <p role="status">Disponible en Mi cuenta → Historial, con los datos y la conversación de esta cotización.</p>}
  </div></>
}
