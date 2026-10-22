import { CURRENCY_LABELS } from '../lib/currency'
import React, { useEffect, useMemo, useState } from 'react'
import type { ProductConfirmationData, ClassificationClarificationTarget } from '../lib/productConfirmation'
import { resolvedProductVolumeCbm } from '../lib/productConfirmation'
import { supplierQuotePrice, type SupplierQuote } from '../lib/supplierQuote'
import { readProductDraft, writeProductDraft } from '../lib/productDraft'
import { recordCaseAnswer, readCaseConversation, writeCaseConversation } from '../lib/caseConversation'
import type { PurchaseCapacity } from '../lib/purchasePlan'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'
import ManualNcmPicker from './ManualNcmPicker'
import SupplierQuoteReview from './SupplierQuoteReview'
import AccountControls from '../auth/AccountControls'
import PackagingWizard from './PackagingWizard'
import { usd } from '../lib/format'

type Question = { id: string; prompt: string; value: string; type?: 'number' | 'text'; options?: Array<[string,string]>; valid: (value: string) => boolean; apply: (value: string) => void }
type Props = { profileContext?: string; analysis: ProductAnalysisV2; draft: ProductConfirmationData; quote: SupplierQuote; capacity: PurchaseCapacity; classified: boolean; askedForMore: boolean; clarificationTarget: ClassificationClarificationTarget; exhausted: boolean; status: string; blocker?: string | null; authRequired: boolean; candidates?: React.ReactNode; hasPreciseClarification?: boolean; onDraft: (draft: ProductConfirmationData) => void; onQuote: (quote: SupplierQuote) => void; onConfirm: () => void; onManual: (customs: ProductAnalysisV2['customs']) => void }
export default function GuidedCaseReview({ profileContext, analysis, draft, quote, capacity, classified, askedForMore, clarificationTarget, exhausted, status, blocker, authRequired, candidates, hasPreciseClarification = false, onDraft, onQuote, onConfirm, onManual }: Props) {
  const source = analysis.sourceUrl
  const [skipped, setSkipped] = useState<string[]>(() => readProductDraft<string[]>(`guide-skipped:${source}`) || [])
  const [packaging, setPackaging] = useState(false)
  const [backStack, setBackStack] = useState<string[]>([])
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
  const productQuestion = (id: keyof ProductConfirmationData, prompt: string, type: 'text' | 'number' = 'text'): Question => ({ id, prompt, value: String(draft[id] || ''), type, valid: type === 'number' ? positive : textValid, apply: v => onDraft({ ...draft, [id]: type === 'number' ? Number(v) : v }) })
  const offerQuestion = (id: keyof SupplierQuote, prompt: string, options?: Array<[string,string]>, numeric = false): Question => ({ id: `quote.${id}`, prompt, value: String(quote[id] || ''), type: numeric ? 'number' : 'text', options, valid: options ? v => options.some(([key]) => key === v) : numeric ? (id === 'minQuantity' || id === 'unitsPerPack' ? integer : positive) : textValid, apply: v => onQuote({ ...quote, [id]: numeric ? Number(v) : v.trim() }) })
  const all: Question[] = [
    productQuestion('productName', '¿Qué producto es?'), productQuestion('functionText', '¿Para qué se usa principalmente?'), productQuestion('category', '¿Qué tipo de producto es?'), productQuestion('description', '¿Qué detalle técnico distingue el producto?'), productQuestion('material', '¿Cuál es su material o composición principal?'),
    offerQuestion('amount', '¿Cuál es el precio del proveedor en su moneda original?', undefined, true),
    offerQuestion('currency', '¿En qué moneda está expresado ese precio?', Object.entries(CURRENCY_LABELS).map(([key,label]) => [key, `${label} (${key})`] as [string,string])),
    offerQuestion('basis', '¿Ese precio es por unidad o por lote?', [['unit','Por una unidad'],['pack','Por un lote / caja']]),
    offerQuestion('unitsPerPack', '¿Cuántas unidades incluye ese lote?', undefined, true), offerQuestion('variant','¿A qué variante o modelo corresponde esa oferta?'),
    offerQuestion('minQuantity', '¿Desde cuántas unidades es válido ese precio?', undefined, true),
    { ...offerQuestion('maxQuantity', '¿Hasta cuántas unidades vale ese precio? Dejá vacío sólo si confirmaste que no tiene límite.'), type: 'number', valid: v => v === '' || integer(v), apply: v => onQuote({ ...quote, maxQuantity: v === '' ? null : Number(v) }) },
    offerQuestion('usdPerCurrency', `¿Cuántos USD equivalen a 1 ${quote.currency}?`, undefined, true), offerQuestion('fxSource','¿Cuál es la fuente de ese tipo de cambio?'),
    { ...offerQuestion('fxDate', '¿De qué fecha es el tipo de cambio? (AAAA-MM-DD)'), valid: v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) },
    productQuestion('originCountry','¿Cuál es el país de origen de la mercadería?'), productQuestion('unitWeightKg','¿Cuánto pesa una unidad embalada, en kg?','number'),
    { ...productQuestion('unitVolumeCbm','¿Qué volumen ocupa una unidad embalada, en m³?','number'), apply: v => onDraft({ ...draft, unitVolumeCbm: Number(v), packageLengthCm: undefined, packageWidthCm: undefined, packageHeightCm: undefined }) },
    { ...productQuestion('quantity', capacity.mode === 'units' ? `Cantidad elegida (tu rango: ${capacity.min}–${capacity.max})` : 'Cantidad elegida'), value: String(draft.quantity ?? (capacity.mode === 'units' ? capacity.min : '')), valid: integer },
    { ...productQuestion('moq','¿Cuál es el mínimo del proveedor? Si no lo sabés, dejalo sin dato.','number'), valid: v => v === '' || integer(v) },
  ]
  const conversation = useMemo(() => readCaseConversation(source), [source, draft, quote, skipped, backStack, answeredAttempt])
  const hasConfirmedAnswer = (question: Question) => {
    const messages = conversation
    return messages.some((message, index) => message.role === 'assistant' && message.text === question.prompt && messages[index + 1]?.role === 'user' && messages[index + 1].text !== 'No lo sé todavía')
  }
  const needs = (question: Question) => {
    if (question.id === 'quantity') return false
    if (question.id === 'category' || question.id === 'description') return askedForMore && clarificationTarget === question.id && answeredAttempt !== attempt
    if (question.id === 'material') return askedForMore && clarificationTarget === 'material' && answeredAttempt !== attempt
    if (question.id === 'quote.unitsPerPack') return quote.basis === 'pack' && (!integer(String(quote.unitsPerPack)) || !hasConfirmedAnswer(question))
    if (question.id === 'quote.minQuantity' || question.id === 'quote.maxQuantity') return !hasConfirmedAnswer(question)
    if (['quote.usdPerCurrency','quote.fxSource','quote.fxDate'].includes(question.id) && (!quote.currency || quote.currency === 'USD')) return false
    if (question.id === 'unitVolumeCbm') return resolvedProductVolumeCbm(draft) <= 0
    if (question.id === 'moq') return !draft.moq && !skipped.includes('moq')
    return !question.valid(question.value)
  }
  const preciseClarification = askedForMore && hasPreciseClarification
  const forced = askedForMore && !preciseClarification && !exhausted && answeredAttempt !== attempt ? all.find(q => q.id === clarificationTarget) ?? productQuestion('description', '¿Qué detalle técnico falta para identificarlo?') : null
  const pending = all.find(q => needs(q) && (classified || !skipped.includes(q.id)) && q.id !== 'moq') ?? (all.find(q => q.id === 'moq' && needs(q)) || null)
  const question = edit ? all.find(q => q.id === edit) || null : forced || pending
  useEffect(() => { setValue(question?.value || ''); setPackaging(question?.id === 'unitVolumeCbm'); let active = true; queueMicrotask(() => active && document.querySelector<HTMLElement>('#case-confirmation .case-question input, #case-confirmation .case-question select, #case-confirmation .case-question button')?.focus()); return () => { active = false } }, [question?.id, edit, attempt])
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      if (manual) document.querySelector<HTMLInputElement>('#case-confirmation .manual-ncm-picker input')?.focus()
      else if (!question && !advanced) document.querySelector<HTMLButtonElement>('#case-confirmation .case-review > .journey-primary-action')?.focus()
    })
    return () => { active = false }
  }, [manual, advanced, question?.id])
  const answer = () => {
    if (!question || !question.valid(value)) return
    setBackStack(current => [...current, question.id])
    question.apply(value)
    recordCaseAnswer(source, question.prompt, question.options?.find(([key]) => key === value)?.[1] || value || (question.id === 'quote.maxQuantity' ? 'Confirmo que no tiene límite' : 'Sin dato'))
    if (forced?.id === question.id) setAnsweredAttempt(attempt)
    setSkipped(current => current.filter(id => id !== question.id)); setEdit(null)
    if (question.id === 'moq' && !value) setSkipped(current => [...current, 'moq'])
  }
  const help: Record<string,string> = {
    productName: 'Usá el nombre comercial y, si existe, el modelo. Evitá describirlo sólo como accesorio o repuesto.',
    functionText: 'Contá qué hace y para qué se usa. Esta información ayuda a identificar la posición aduanera correcta.',
    material: 'Indicá el material principal o la composición. Si combina materiales, contanos cuáles.',
    'quote.amount': 'Ingresá el importe que figura en la oferta. Después confirmamos moneda y presentación.',
    'quote.currency': 'Seleccioná la moneda indicada por el proveedor. El símbolo $ por sí solo no alcanza.',
    'quote.basis': 'Una unidad es una pieza. Un lote o caja puede incluir varias: necesitamos distinguirlos para calcular el precio unitario.',
    'quote.unitsPerPack': 'Contá cuántas piezas incluye el precio del lote. No ingreses la cantidad total que querés comprar.',
    'quote.variant': 'Indicá el modelo, tamaño o variante que tiene ese precio. Las fotos pueden mostrar opciones más caras.',
    'quote.minQuantity': 'Es el inicio del tramo de precio: por ejemplo, USD 10 desde 100 piezas. Después preguntamos el mínimo de compra del proveedor.',
    'quote.maxQuantity': 'Es el final de ese tramo de precio. Dejalo vacío sólo si el proveedor confirmó que sigue siendo válido sin límite superior.',
    'quote.usdPerCurrency': 'Usá una conversión a dólares vigente para la moneda de la oferta. No ingreses una cotización en pesos argentinos.',
    'quote.fxSource': 'Indicá de dónde obtuviste la conversión: banco, proveedor o publicación verificable.',
    'quote.fxDate': 'Ingresá la fecha de la conversión para que el presupuesto conserve su referencia.',
    originCountry: 'Es el país de fabricación de la mercadería. Puede ser distinto del país donde está el vendedor.',
    unitWeightKg: 'Incluí la caja y la protección de una unidad. El peso y el volumen se usan para estimar el flete.',
    unitVolumeCbm: 'Medí la caja exterior que viaja. Calculamos el volumen desde sus medidas; si ya conocés los m³, podés ingresarlos como alternativa.',
    moq: 'Es la menor cantidad que el proveedor acepta vender (MOQ). Si no la conocés, dejala pendiente para validarla antes de comprar.',
  }
  const processing = status === 'processing'
  return <section className="guided-case" id="case-confirmation" aria-busy={processing}>
    <aside className="quote-progress-rail"><div className="workspace-section-heading"><span className="eyebrow">Tu ficha de importación</span><h2>Un dato a la vez. Tu resultado al final.</h2><p>Completá la pregunta resaltada y tocá Continuar. Guardamos tus respuestas; podés volver para corregirlas.</p></div>
    <p className="workspace-capacity">Tu compra: {capacity.mode === 'budget' ? `hasta ${usd(capacity.budgetUsd)} en total` : capacity.mode === 'units' ? `${capacity.min}–${capacity.max} unidades` : 'explorar desde una unidad'}.</p>
    <ol aria-label="Etapas de la cotización"><li>✓ Tu operación</li><li>✓ Tu compra</li><li aria-current="step">3. Producto y oferta</li><li>4. Tu resultado</li></ol></aside><div className="quote-focus-content">
    <div className={`workspace-classification-status ${classified ? 'is-confirmed' : ''}`}><b>{classified ? `NCM validada: ${analysis.customs.ncmCandidate}` : 'Clasificación pendiente de validar'}</b><span>{classified ? analysis.customs.source : 'Revisá la identidad del producto o seleccioná una posición del nomenclador. Sin una clasificación válida no mostramos un costo de importación.'}</span></div>
    {blocker && (!(preciseClarification || exhausted) || authRequired || !blocker.startsWith('No pude cerrar una NCM')) && <p role="alert" className="case-alert">{blocker}</p>}
    {authRequired && <AccountControls />}
    {processing ? <p role="status" className="quote-processing"><span className="quote-processing-indicator" aria-hidden="true" />{classified ? 'Calculando tus opciones de compra…' : 'Validando la clasificación del producto…'}</p> : <>
      {exhausted && !classified && !manual && <div><p role="alert">No hay una clasificación validada. Conservamos tu ficha y tus respuestas; podés buscar una posición en el nomenclador.</p><button type="button" className="journey-primary-action" onClick={() => setManual(true)}>Buscar posición en el nomenclador</button></div>}
      {!manual && !advanced && !preciseClarification && !(exhausted && !classified) && (question ? <div className="case-question" aria-live="polite">
        <span className="eyebrow">Completá este dato para avanzar</span><h2 hidden={packaging}>{question.prompt}</h2><p hidden={packaging} className="workspace-help">{help[question.id] || 'Describí el detalle técnico que permite distinguir este producto. No hace falta inventar un dato.'}</p>
        {question.id === 'unitVolumeCbm' && packaging ? <PackagingWizard recoveryKey={source} onCancel={() => setPackaging(false)} onComplete={volume => { onDraft({ ...draft, unitVolumeCbm: volume, packageLengthCm: undefined, packageWidthCm: undefined, packageHeightCm: undefined }); recordCaseAnswer(source, question.prompt, `${volume} m³ por unidad, calculado desde medidas`); setPackaging(false) }} /> : question.id === 'quote.currency' ? <label><span className="sr-only">{question.prompt}</span><select autoFocus aria-label={question.prompt} value={value} onChange={event => setValue(event.target.value)}><option value="">Elegí la moneda</option>{question.options!.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label> : question.options ? <div className="case-choices" role="group" aria-label={question.prompt}>{question.options.map(([key,label],index) => <button autoFocus={index === 0} type="button" key={key} aria-pressed={value === key} onClick={() => setValue(key)}>{label}</button>)}</div> : <label><span className="sr-only">{question.prompt}</span><input autoFocus key={question.id} type={question.type || 'text'} inputMode={question.type === 'number' ? 'decimal' : 'text'} step="any" value={value} onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') answer() }} /></label>}
        <button hidden={packaging} type="button" className="journey-primary-action" disabled={!question.valid(value)} onClick={answer}>Continuar</button>
        {!packaging && !!backStack.length && <button type="button" className="pipeline-secondary" onClick={() => { setEdit(backStack[backStack.length - 1]); setBackStack(current => current.slice(0,-1)); setPackaging(false) }}>Atrás</button>}
        {!packaging && (question.id === 'moq' || (!classified && !forced && !['productName','functionText'].includes(question.id))) ? <button type="button" className="pipeline-secondary" onClick={() => { recordCaseAnswer(source,question.prompt,'No lo sé todavía'); setSkipped(current => [...current,question.id]); setEdit(null) }}>No sé todavía</button> : null}
        {question.id === 'unitVolumeCbm' && !packaging && <button type="button" className="pipeline-secondary" onClick={() => setPackaging(true)}>Tengo medidas en lugar de volumen</button>}
      </div> : <div className="case-review"><h2>Revisá y confirmá</h2><p>Tu elección: {capacity.mode === 'budget' ? `hasta ${usd(capacity.budgetUsd)} en total` : capacity.mode === 'units' ? `${capacity.min}–${capacity.max} unidades` : 'explorar desde una unidad'}. No volvemos a preguntarte la cantidad.</p>
        <dl className="confirmation-facts"><div><dt>Producto</dt><dd>{draft.productName}</dd></div><div><dt>Oferta</dt><dd>{quote.currency || 'Moneda pendiente'} {quote.amount || 'Precio pendiente'} / {quote.basis === 'pack' ? `lote de ${quote.unitsPerPack}` : 'unidad'} · {quote.variant || 'Variante pendiente'}</dd></div><div><dt>Origen</dt><dd>{draft.originCountry || 'Pendiente'}</dd></div><div><dt>Embalaje por unidad</dt><dd>{draft.unitWeightKg || 'Peso pendiente'} kg · {resolvedProductVolumeCbm(draft) || 'Volumen pendiente'} m³</dd></div></dl><details><summary>Revisar respuestas y corregir un dato</summary><dl>{all.filter(q => q.id === 'quote.unitsPerPack' ? quote.basis === 'pack' : ['quote.usdPerCurrency','quote.fxSource','quote.fxDate'].includes(q.id) ? !!quote.currency && quote.currency !== 'USD' : true).map(q => <div key={q.id}><dt>{q.prompt}</dt><dd>{q.options?.find(([key]) => key === q.value)?.[1] || q.value || (q.id === 'quote.maxQuantity' && hasConfirmedAnswer(q) ? 'Sin límite confirmado' : 'Sin dato')} <button type="button" onClick={() => setEdit(q.id)}>Editar</button></dd></div>)}</dl></details>
        {!classified && <p>Los datos comerciales que todavía no conocés quedan pendientes; no inventamos el costo.</p>}
        <button type="button" className="journey-primary-action" disabled={exhausted && !classified} onClick={() => { recordCaseAnswer(source,'¿Confirmás estos datos?\n' + all.filter(q => q.value).map(q => `${q.prompt} ${q.value}`).join('\n'),classified ? 'Confirmo y calculo mi compra.' : 'Confirmo y clasifico el producto.'); onConfirm() }}>{classified ? 'Confirmar y calcular mis opciones' : 'Confirmar y clasificar'}</button>
      </div>)}
      {!manual && !advanced && !classified && !exhausted && (preciseClarification || !question) && candidates}
      {!manual && !advanced && <details className="quote-help-actions"><summary>Opciones de clasificación y oferta</summary><button type="button" className="pipeline-secondary" aria-expanded={manual} onClick={() => setManual(v => !v)}>Buscar en el nomenclador</button><button type="button" className="pipeline-secondary" onClick={() => setAdvanced(true)}>Editar tramos de precio</button></details>}
      {manual && <><h2>Validá la posición aduanera</h2><ManualNcmPicker customs={analysis.customs} recoveryKey={source} onSelect={customs => { onManual(customs); setManual(false) }} /><button type="button" className="pipeline-secondary" onClick={() => setManual(false)}>Volver al paso anterior</button></>}
      {advanced && <div className="case-advanced"><h3 className="workspace-form-heading">Oferta comercial y datos del producto</h3><SupplierQuoteReview quote={quote} quantity={draft.quantity} sourceUrl={source} evidence={analysis.product.supplierEvidence} onChange={onQuote} />
        <button type="button" className="pipeline-secondary" onClick={() => setAdvanced(false)}>Volver a la pregunta</button>
      </div>}
    </>}</div>
  </section>
}
