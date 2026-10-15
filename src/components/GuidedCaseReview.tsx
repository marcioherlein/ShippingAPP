import { CURRENCY_LABELS } from '../lib/currency'
import React, { useEffect, useState } from 'react'
import type { ProductConfirmationData, ClassificationClarificationTarget } from '../lib/productConfirmation'
import { resolvedProductVolumeCbm } from '../lib/productConfirmation'
import { supplierQuotePrice, type SupplierQuote } from '../lib/supplierQuote'
import { readProductDraft, writeProductDraft } from '../lib/productDraft'
import { recordCaseAnswer, readCaseConversation, writeCaseConversation } from '../lib/caseConversation'
import type { PurchaseCapacity } from '../lib/purchasePlan'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'
import CaseConversation from './CaseConversation'
import ManualNcmPicker from './ManualNcmPicker'
import SupplierQuoteReview from './SupplierQuoteReview'
import AccountControls from '../auth/AccountControls'
import { usd } from '../lib/format'

type Question = { id: string; prompt: string; value: string; type?: 'number' | 'text'; options?: Array<[string,string]>; valid: (value: string) => boolean; apply: (value: string) => void }
type Props = { profileContext?: string; analysis: ProductAnalysisV2; draft: ProductConfirmationData; quote: SupplierQuote; capacity: PurchaseCapacity; classified: boolean; askedForMore: boolean; clarificationTarget: ClassificationClarificationTarget; exhausted: boolean; status: string; blocker?: string | null; authRequired: boolean; candidates?: React.ReactNode; onDraft: (draft: ProductConfirmationData) => void; onQuote: (quote: SupplierQuote) => void; onConfirm: () => void; onManual: (customs: ProductAnalysisV2['customs']) => void }
export default function GuidedCaseReview({ profileContext, analysis, draft, quote, capacity, classified, askedForMore, clarificationTarget, exhausted, status, blocker, authRequired, candidates, onDraft, onQuote, onConfirm, onManual }: Props) {
  const source = analysis.sourceUrl
  const [skipped, setSkipped] = useState<string[]>(() => readProductDraft<string[]>(`guide-skipped:${source}`) || [])
  const [manual, setManual] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [edit, setEdit] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [answeredAttempt, setAnsweredAttempt] = useState(-1)
  const attempt = analysis.classificationRefinement?.attempt ?? 0
  useEffect(() => { writeProductDraft(`guide-skipped:${source}`, skipped) }, [source, skipped])
  useEffect(() => {
    if (readCaseConversation(source).length) return
    const entry = readProductDraft<{ chatAnswers?: Record<string,string> }>('entry')
    const messages = [
      { role: 'assistant' as const, text: '¿Querés calcular con presupuesto, unidades o explorar?' },
      { role: 'user' as const, text: capacity.mode === 'budget' ? `Mi presupuesto total es ${usd(capacity.budgetUsd)}.` : capacity.mode === 'units' ? `Quiero ${capacity.min === capacity.max ? capacity.min : `${capacity.min}–${capacity.max}`} unidades.` : 'Quiero ver el costo de una unidad y algunas alternativas.' },
      { role: 'assistant' as const, text: '¿Qué producto querés importar?' },
      { role: 'user' as const, text: `${draft.productName || 'Producto por completar'}${source.startsWith('https://') ? ` · ${source}` : ''}` },
    ]
    const search = readProductDraft<{ lastSearch?: string; failedSourceUrl?: string; messages?: Array<{ role: 'assistant'|'user'; content: string }>; discovery?: { results?: Array<{ url: string }> } }>('search')
    if (search?.lastSearch === source || search?.lastSearch === draft.productName || search?.failedSourceUrl === source || search?.discovery?.results?.some(item => item.url === source)) {
      messages.splice(2, 0, ...(search.messages || []).map(message => ({ role: message.role, text: message.content })))
    }
    if (profileContext) messages.unshift({ role: 'assistant', text: '¿Cuál es tu perfil para esta importación?' }, { role: 'user', text: profileContext })
    if (entry?.chatAnswers?.name === draft.productName) {
      const prompts: Record<string,string> = { use:'¿Para qué se usa?', material:'¿De qué está hecho?', price:'¿Cuánto vale al proveedor en USD?', origin:'¿De dónde viene?', weight:'¿Cuánto pesa una unidad embalada en kg?', moq:'¿Cuál es el mínimo del proveedor?', volume:'¿Qué volumen tiene el embalaje en m³?', carton:'¿Cuántas unidades lleva la caja?' }
      for (const [key, text] of Object.entries(entry.chatAnswers)) if (key !== 'name' && prompts[key]) messages.push({role:'assistant',text:prompts[key]}, {role:'user',text:text || 'Sin dato'})
    }
    messages.push({ role: 'assistant', text: `Datos leídos: ${analysis.product.supplierEvidence?.priceText || 'precio sin texto original'} · MOQ: ${draft.moq || 'sin dato'} · peso: ${draft.unitWeightKg || 'sin dato'} kg/u. · volumen: ${resolvedProductVolumeCbm(draft) || 'sin dato'} m³/u. Confirmalos o corregilos antes de cotizar.` })
    writeCaseConversation(source, messages); window.dispatchEvent(new CustomEvent('shippingapp:conversation-updated'))
  }, [source])
  const textValid = (s: string) => s.trim().length >= 3
  const positive = (s: string) => Number.isFinite(Number(s)) && Number(s) > 0
  const integer = (s: string) => positive(s) && Number.isInteger(Number(s))
  const productQuestion = (id: keyof ProductConfirmationData, prompt: string, type: 'text' | 'number' = 'text'): Question => ({ id, prompt, value: String(draft[id] || ''), type, valid: type === 'number' ? positive : textValid, apply: v => onDraft({ ...draft, [id]: type === 'number' ? Number(v) : v.trim() }) })
  const offerQuestion = (id: keyof SupplierQuote, prompt: string, options?: Array<[string,string]>, numeric = false): Question => ({ id: `quote.${id}`, prompt, value: String(quote[id] || ''), type: numeric ? 'number' : 'text', options, valid: options ? v => options.some(([key]) => key === v) : numeric ? (id === 'minQuantity' || id === 'unitsPerPack' ? integer : positive) : textValid, apply: v => onQuote({ ...quote, [id]: numeric ? Number(v) : v.trim() }) })
  const all: Question[] = [
    productQuestion('productName', '¿Qué producto es?'), productQuestion('functionText', '¿Para qué se usa principalmente?'), productQuestion('category', '¿Qué tipo de producto es?'), productQuestion('description', '¿Qué detalle técnico distingue el producto?'), productQuestion('material', '¿Cuál es su material o composición principal?'),
    offerQuestion('amount', '¿Cuál es el precio del proveedor en su moneda original?', undefined, true),
    offerQuestion('currency', '¿En qué moneda está expresado ese precio?', Object.entries(CURRENCY_LABELS).map(([key,label]) => [key, `${label} (${key})`] as [string,string])),
    offerQuestion('basis', '¿Ese precio es por unidad o por lote?', [['unit','Por una unidad'],['pack','Por un lote / caja']]),
    offerQuestion('unitsPerPack', '¿Cuántas unidades incluye ese lote?', undefined, true), offerQuestion('variant','¿A qué variante o modelo corresponde esa oferta?'),
    offerQuestion('minQuantity', '¿Desde cuántas unidades es válido ese precio?', undefined, true),
    offerQuestion('usdPerCurrency', `¿Cuántos USD equivalen a 1 ${quote.currency}?`, undefined, true), offerQuestion('fxSource','¿Cuál es la fuente de ese tipo de cambio?'),
    { ...offerQuestion('fxDate', '¿De qué fecha es el tipo de cambio? (AAAA-MM-DD)'), valid: v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) },
    productQuestion('originCountry','¿Cuál es el país de origen de la mercadería?'), productQuestion('unitWeightKg','¿Cuánto pesa una unidad embalada, en kg?','number'),
    productQuestion('unitVolumeCbm','¿Qué volumen ocupa una unidad embalada, en m³?','number'),
    { ...productQuestion('quantity', capacity.mode === 'units' ? `Cantidad elegida (tu rango: ${capacity.min}–${capacity.max})` : 'Cantidad elegida'), value: String(draft.quantity ?? (capacity.mode === 'units' ? capacity.min : '')), valid: integer },
    { ...productQuestion('moq','¿Cuál es el mínimo del proveedor? Si no lo sabés, dejalo sin dato.','number'), valid: v => v === '' || integer(v) },
  ]
  const needs = (question: Question) => {
    if (question.id === 'quantity') return false
    if (question.id === 'category' || question.id === 'description') return askedForMore && clarificationTarget === question.id && answeredAttempt !== attempt
    if (question.id === 'material') return askedForMore && clarificationTarget === 'material' && answeredAttempt !== attempt
    if (question.id === 'quote.unitsPerPack') return quote.basis === 'pack' && !integer(String(quote.unitsPerPack))
    if (question.id === 'quote.minQuantity') return !readCaseConversation(source).some(m => m.role === 'assistant' && m.text === question.prompt)
    if (['quote.usdPerCurrency','quote.fxSource','quote.fxDate'].includes(question.id) && (!quote.currency || quote.currency === 'USD')) return false
    if (question.id === 'unitVolumeCbm') return resolvedProductVolumeCbm(draft) <= 0
    if (question.id === 'moq') return !draft.moq && !skipped.includes('moq')
    return !question.valid(question.value)
  }
  const forced = askedForMore && !exhausted && answeredAttempt !== attempt ? all.find(q => q.id === clarificationTarget) ?? productQuestion('description', '¿Qué detalle técnico falta para identificarlo?') : null
  const pending = all.find(q => needs(q) && (classified || !skipped.includes(q.id)) && q.id !== 'moq') ?? (all.find(q => q.id === 'moq' && needs(q)) || null)
  const question = edit ? all.find(q => q.id === edit) || null : forced || pending
  useEffect(() => { setValue(question?.value || '') }, [question?.id, edit, attempt])
  const answer = () => {
    if (!question || !question.valid(value)) return
    question.apply(value)
    recordCaseAnswer(source, question.prompt, question.options?.find(([key]) => key === value)?.[1] || value || 'Sin dato')
    if (forced?.id === question.id) setAnsweredAttempt(attempt)
    setSkipped(current => current.filter(id => id !== question.id)); setEdit(null)
    if (question.id === 'moq' && !value) setSkipped(current => [...current, 'moq'])
  }
  const processing = status === 'processing'
  return <section className="guided-case" id="case-confirmation" aria-busy={processing}>
    <CaseConversation sourceUrl={source} />
    {blocker && <p role="alert" className="case-alert">{blocker}</p>}
    {authRequired && <AccountControls />}
    {processing ? <p role="status">{classified ? 'Calculando tus opciones de compra…' : 'Validando la clasificación del producto…'}</p> : <>
      {exhausted && !classified && <p role="alert">No hay una clasificación validada. Podés revisar tu ficha o buscar en el nomenclador, sin cambiar de producto.</p>}
      {question ? <div className="case-question">
        <h2>{question.prompt}</h2>
        {question.options ? <div className="case-choices" role="group" aria-label={question.prompt}>{question.options.map(([key,label]) => <button type="button" key={key} aria-pressed={value === key} onClick={() => setValue(key)}>{label}</button>)}</div> : <label><span>{question.prompt}</span><input key={question.id} type={question.type || 'text'} inputMode={question.type === 'number' ? 'decimal' : 'text'} step="any" value={value} onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') answer() }} /></label>}
        <button type="button" className="journey-primary-action" disabled={!question.valid(value)} onClick={answer}>Continuar</button>
        {question.id === 'moq' || (!classified && !forced && !['productName','functionText'].includes(question.id)) ? <button type="button" className="pipeline-secondary" onClick={() => { recordCaseAnswer(source,question.prompt,'No lo sé todavía'); setSkipped(current => [...current,question.id]); setEdit(null) }}>No sé todavía</button> : null}
        {question.id === 'unitVolumeCbm' && <button type="button" className="pipeline-secondary" onClick={() => setAdvanced(true)}>Tengo medidas en lugar de volumen</button>}
      </div> : <div className="case-review"><h2>Revisá y confirmá</h2><p>Tu elección: {capacity.mode === 'budget' ? `hasta ${usd(capacity.budgetUsd)} en total` : capacity.mode === 'units' ? `${capacity.min}–${capacity.max} unidades` : 'explorar desde una unidad'}. No volvemos a preguntarte la cantidad.</p>
        <dl>{all.filter(q => !['quote.usdPerCurrency','quote.fxSource','quote.fxDate','quote.unitsPerPack'].includes(q.id) || needs(q)).map(q => <div key={q.id}><dt>{q.prompt}</dt><dd>{q.options?.find(([key]) => key === q.value)?.[1] || q.value || 'Sin dato'} <button type="button" onClick={() => setEdit(q.id)}>Editar</button></dd></div>)}</dl>
        {!classified && <p>Los datos comerciales que todavía no conocés quedan pendientes; no inventamos el costo.</p>}
        <button type="button" className="journey-primary-action" disabled={exhausted && !classified} onClick={() => { recordCaseAnswer(source,'¿Confirmás estos datos?\n' + all.filter(q => q.value).map(q => `${q.prompt} ${q.value}`).join('\n'),classified ? 'Confirmo y calculo mi compra.' : 'Confirmo y clasifico el producto.'); onConfirm() }}>{classified ? 'Confirmar y calcular mis opciones' : 'Confirmar y clasificar'}</button>
      </div>}
      {!classified && candidates}
      <button type="button" className="pipeline-secondary" aria-expanded={manual} onClick={() => setManual(v => !v)}>Buscar en el nomenclador</button>
      {manual && <ManualNcmPicker customs={analysis.customs} recoveryKey={source} onSelect={customs => { onManual(customs); setManual(false) }} />}
      <button type="button" className="pipeline-secondary" aria-expanded={advanced} onClick={() => setAdvanced(v => !v)}>Editar ficha y tramos de precio</button>
      {advanced && <div className="case-advanced"><SupplierQuoteReview quote={quote} quantity={draft.quantity} sourceUrl={source} evidence={analysis.product.supplierEvidence} onChange={onQuote} />
        {all.filter(q => !q.id.startsWith('quote.')).map(q => <label key={q.id}><span>{q.prompt}</span><input value={q.value} type={q.type || 'text'} step="any" onChange={event => q.apply(event.target.value)} /></label>)}
        <div className="pipeline-dimensions">{(['packageLengthCm','packageWidthCm','packageHeightCm'] as const).map((key,index) => <label key={key}><span>{['Largo (cm)','Ancho (cm)','Alto (cm)'][index]}</span><input type="number" min="0" step="any" value={draft[key] || ''} onChange={event => onDraft({ ...draft, unitVolumeCbm: 0, [key]: Number(event.target.value) })} /></label>)}</div>
        <p>Medidas de una unidad embalada. Volumen: {resolvedProductVolumeCbm(draft).toFixed(6)} m³.</p><button type="button" className="pipeline-secondary" onClick={() => { recordCaseAnswer(source, '¿Desde cuántas unidades es válido ese precio?', String(quote.minQuantity)); setAdvanced(false) }}>Volver al chat</button>
      </div>}
    </>}
  </section>
}
