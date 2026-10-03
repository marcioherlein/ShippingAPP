import ManualNcmPicker from './ManualNcmPicker'
import NcmDisambiguation from './NcmDisambiguation'
import DsSelect from './DsSelect'
import UiIcon from './UiIcon'
import type { CustomsProfile } from '../lib/customsClassification'
import React, { useEffect, useMemo, useState } from 'react'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'
import type { QuotePrefill } from '../lib/hotProducts'
import { usd } from '../lib/format'
import { convertToUsd, CURRENCY_LABELS, type CurrencyCode } from '../lib/currency'
import {
  applyClassificationClarification,
  classificationClarificationTarget,
  missingClassificationConfirmationFields,
  missingQuoteConfirmationFields,
  productConfirmationFromAnalysis,
  resolvedProductVolumeCbm,
  type ClassificationClarificationTarget,
  type ProductConfirmationData,
} from '../lib/productConfirmation'

export type CalculationPipelineStatus = 'confirm' | 'processing' | 'blocked' | 'ready'

export type CalculationPipelineSummary = {
  baseQuantity: number
  selectedMode: 'lcl' | 'air' | 'courier'
  unitCostUsd: number
  totalCostUsd: number
  freightCostUsd: number
}

type Props = {
  analysis: ProductAnalysisV2
  prefill: QuotePrefill
  status: CalculationPipelineStatus
  activeStage: number
  summary?: CalculationPipelineSummary | null
  blocker?: string | null
  onConfirm: (product: ProductConfirmationData) => void
  onManualNcm: (customs: CustomsProfile, product: ProductConfirmationData) => void
  onEditProduct: () => void
  onReviewProduct: () => void
  autoConfirm?: boolean
  silent?: boolean
}

const interventionCategories = new Set(['food', 'toys', 'cosmetics', 'medicines', 'supplements', 'plants'])

const pipelineSteps = [
  {
    title: 'Clasificación arancelaria',
    description: 'Cruzo la identidad confirmada —qué es, material, función y detalles técnicos— contra el nomenclador NCM completo.',
  },
  {
    title: 'Aranceles y costos automáticos',
    description: 'Cargo derecho, tasa estadística, IVA y percepciones. Si corresponde intervención, sumo USD 200 de trámite automáticamente.',
  },
  {
    title: 'Logística internacional',
    description: 'Uso origen, peso y volumen confirmados para comparar LCL, aéreo y Courier comercial.',
  },
  {
    title: 'Costo puesto unitario',
    description: 'Compongo FOB + flete + tributos + gastos y lo llevo a costo por unidad de la cantidad base.',
  },
]

function confidenceLabel(value: ProductAnalysisV2['customs']['classificationConfidence']) {
  if (value === 'high') return 'Alta'
  if (value === 'medium') return 'Media'
  if (value === 'low') return 'Baja'
  return 'Pendiente'
}

function hasInterventionFee(prefill: QuotePrefill) {
  return interventionCategories.has(prefill.sensitiveCategory)
}

function stageState(index: number, status: CalculationPipelineStatus, activeStage: number) {
  if (status === 'confirm') return 'pending'
  if (status === 'ready') return 'done'
  if (status === 'blocked') {
    if (index < activeStage) return 'done'
    if (index === activeStage) return 'blocked'
    return 'pending'
  }
  if (index < activeStage) return 'done'
  if (index === activeStage) return 'active'
  return 'pending'
}

function stageDetail(index: number, analysis: ProductAnalysisV2, prefill: QuotePrefill, summary?: CalculationPipelineSummary | null) {
  if (index === 0) {
    if (analysis.customs.ncmCandidate) {
      return `NCM ${analysis.customs.ncmCandidate} · confianza ${confidenceLabel(analysis.customs.classificationConfidence)}`
    }
    if (analysis.customs.provisional && analysis.customs.provisionalDutyRatePct != null) {
      return 'Clasificación estimada — verificá antes de operar'
    }
    return 'NCM pendiente de resolución'
  }
  if (index === 1) {
    if (analysis.customs.dutyRatePct === null || analysis.customs.dutyRatePct === undefined) {
      if (analysis.customs.provisional && analysis.customs.provisionalDutyRatePct != null) {
        return `DIE estimado ${analysis.customs.provisionalDutyRatePct}% (conservador) · verificá antes de operar`
      }
      return 'Derecho retenido hasta resolver clasificación'
    }
    const intervention = hasInterventionFee(prefill) ? ' · Trámite intervención USD 200' : ''
    return `DIE ${analysis.customs.dutyRatePct}% · TE ${analysis.customs.statisticsRatePct}% · IVA ${analysis.customs.vatRatePct ?? 21}%${intervention}`
  }
  if (index === 2) {
    return `${prefill.originCountry} · ${prefill.unitWeightKg || 0} kg/u. · ${prefill.unitVolumeCbm || 0} m³/u.`
  }
  if (summary) return `${summary.baseQuantity} u. base · ${summary.selectedMode === 'lcl' ? 'LCL' : summary.selectedMode === 'air' ? 'Aéreo' : 'Courier comercial'} · ${usd(summary.unitCostUsd)}/u.`
  return `Cantidad base: ${prefill.quantity || prefill.moq || 1} unidades`
}

function pipelineStatusAnnouncement(status: CalculationPipelineStatus, activeStage: number, blocker?: string | null, summary?: CalculationPipelineSummary | null) {
  if (status === 'confirm') return 'El cálculo espera confirmación de los datos del producto.'
  if (status === 'processing') {
    const stage = pipelineSteps[Math.min(Math.max(activeStage, 0), pipelineSteps.length - 1)]
    return `Procesando: ${stage?.title || 'cálculo de importación'}.`
  }
  if (status === 'blocked') return `Cálculo detenido. ${blocker || 'Hay un dato que necesita revisión antes de continuar.'}`
  if (summary) return `Cálculo completado. Modo ${summary.selectedMode === 'lcl' ? 'LCL' : summary.selectedMode === 'air' ? 'aéreo' : 'Courier comercial'}. Costo puesto por unidad ${usd(summary.unitCostUsd)}.`
  return 'Cálculo completado.'
}

function numberValue(value: string) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function sameIdentity(a: ProductConfirmationData, b: ProductConfirmationData) {
  return a.productName === b.productName
    && a.category === b.category
    && a.description === b.description
    && a.material === b.material
    && a.functionText === b.functionText
}

function knownFact(label: string, value: React.ReactNode, key: string) {
  if (value === '' || value === null || value === undefined || value === 0) return null
  return <div className="pipeline-known-fact" key={key}><span>{label}</span><b>{value}</b></div>
}

function clarificationCopy(analysis: ProductAnalysisV2, target: ClassificationClarificationTarget) {
  const name = analysis.product.name.toLocaleLowerCase('es')
  if (target === 'functionText') {
    const placeholder = /therm|termo|vacuum|water bottle|bottle|jug|flask/.test(name)
      ? 'Ej. Se usa para conservar y transportar bebidas frías o calientes; es un recipiente térmico reutilizable.'
      : /lock|cabinet|drawer|cerradur/.test(name)
        ? 'Ej. Se usa para asegurar puertas de gabinetes y cajones mediante una cerradura mecánica.'
        : 'Ej. Se usa principalmente para…'
    return {
      question: '¿Para qué se usa este producto?',
      helper: 'Con una frase corta alcanza. Necesito la función sólo para distinguir la posición arancelaria correcta.',
      placeholder,
    }
  }
  if (target === 'material') {
    return {
      question: '¿De qué material está hecho principalmente?',
      helper: 'Indicá el material o composición dominante. No hace falta copiar toda la ficha técnica.',
      placeholder: 'Ej. Acero inoxidable con tapa plástica y junta de silicona.',
    }
  }
  if (target === 'category') {
    return {
      question: '¿Qué tipo de producto es?',
      helper: 'Una categoría común alcanza; no necesitás conocer el nombre aduanero.',
      placeholder: 'Ej. Botella térmica / termo reutilizable.',
    }
  }
  return {
    question: '¿Qué detalle técnico distingue a este producto?',
    helper: 'Respondé sólo el dato que falta para evitar una clasificación dudosa.',
    placeholder: 'Ej. Tecnología, mecanismo, material o uso principal que lo diferencia.',
  }
}

/**
 * Actionable guidance shown when the automatic NCM classifier cannot resolve a
 * confident position (audit item #2: "guía al usuario si el nomenclador falla").
 * Turns a dead-end into concrete next steps instead of just reporting failure.
 */
function NomencladorGuidance({ onManualSearch }: { onManualSearch?: () => void }) {
  return <div className="pipeline-ncm-guidance">
    <div className="pipeline-ncm-guidance-head">
      <span className="eyebrow">No te quedes trabado</span>
      <b>Cómo seguir si no puedo clasificarlo solo</b>
      <small>La clasificación NCM depende de material, función y uso. Cuando esos datos no alcanzan, tenés tres caminos y ninguno reinicia el caso.</small>
    </div>
    <ol className="pipeline-ncm-guidance-steps">
      <li><b>Describilo con otras palabras.</b> Sumá material, para qué se usa y qué lo diferencia. Muchas veces el nombre comercial solo no alcanza para elegir la posición.</li>
      <li><b>Buscá la posición vos mismo.</b> Abrí el nomenclador, buscá por producto o código y validamos que exista y tenga aranceles antes de usarla.{onManualSearch && <> <button type="button" className="pipeline-link-action" onClick={onManualSearch}>Abrir el buscador del nomenclador</button></>}</li>
      <li><b>Usá una posición que ya conocés.</b> Si tenés el NCM de una importación anterior o de tu despachante, cargalo directo en el buscador y confirmalo.</li>
    </ol>
  </div>
}

export default function CalculationPipeline({ analysis, prefill, status, activeStage, summary, blocker, onConfirm, onEditProduct, onReviewProduct, onManualNcm, autoConfirm, silent }: Props) {
  const progress = status === 'confirm' ? 0 : status === 'ready' ? 100 : Math.min(100, Math.max(8, ((activeStage + (status === 'processing' ? 0.35 : 0)) / pipelineSteps.length) * 100))
  const interventionFee = hasInterventionFee(prefill)
  const statusAnnouncement = pipelineStatusAnnouncement(status, activeStage, blocker, summary)
  const [draft, setDraft] = useState<ProductConfirmationData>(() => productConfirmationFromAnalysis(analysis))
  const [showManualNcm, setShowManualNcm] = useState(false)
  const [showCorrections, setShowCorrections] = useState(false)
  const [showAllQuoteFields, setShowAllQuoteFields] = useState(false)
  const [clarification, setClarification] = useState('')
  // Currency of the extracted supplier price. Alibaba defaults to USD, but a
  // ¥/€ price must be converted to official dollars before the engine uses it
  // (audit item #1). Kept as UI state so confirming does not mutate the shape
  // of ProductConfirmationData.
  const [priceCurrency, setPriceCurrency] = useState<CurrencyCode>('USD')
  const [fxRateInput, setFxRateInput] = useState('')

  useEffect(() => {
    // A refinement returns a new analysis with the same sourceUrl. Sync from the
    // complete analysis object so a previous clarification is never silently
    // dropped on the next round.
    setDraft(productConfirmationFromAnalysis(analysis))
    setShowCorrections(false)
    setShowAllQuoteFields(false)
    setClarification('')
    setPriceCurrency('USD')
    setFxRateInput('')
  }, [analysis])

  const sourceDraft = useMemo(() => productConfirmationFromAnalysis(analysis), [analysis])
  const classificationMissing = useMemo(() => missingClassificationConfirmationFields(draft), [draft])
  const quoteMissing = useMemo(() => missingQuoteConfirmationFields(draft), [draft])
  const classificationResolved = !!analysis.customs.ncmCandidate
    && (analysis.customs.classificationConfidence === 'high' || analysis.customs.classificationConfidence === 'medium')
    && analysis.customs.dutyRatePct !== null
    && analysis.customs.dutyRatePct !== undefined
  // Best-effort (Decision 1): a conservative tariff estimate exists even when the exact 8-digit
  // position isn't confirmed. We never dead-end — the user can proceed with a clearly-labeled
  // estimate, so for gating purposes classification is "ready" when confirmed OR provisional.
  const provisionalAvailable = analysis.customs.provisional === true
    && analysis.customs.provisionalDutyRatePct !== null
    && analysis.customs.provisionalDutyRatePct !== undefined
  const classificationReady = classificationResolved || provisionalAvailable
  const disambiguation = analysis.customs.disambiguation ?? null
  const hasDisambiguation = !!disambiguation && (disambiguation.candidates.length > 0 || disambiguation.questions.length > 0)
  const refinement = analysis.classificationRefinement
  const refinementExhausted = !classificationResolved
    && refinement?.allowed === false
    && refinement.maxAttempts > 0
    && refinement.attempt >= refinement.maxAttempts
  const identityEdited = !sameIdentity(draft, sourceDraft)
  const classifierAskedForMore = !classificationReady && analysis.customs.missingFacts.length > 0
  const clarificationTarget = classificationClarificationTarget(analysis.customs.missingFacts)
  const clarificationUi = clarificationCopy(analysis, clarificationTarget)
  const clarificationSatisfied = !classifierAskedForMore || identityEdited || clarification.trim().length >= 3
    || (clarificationTarget === 'functionText' && !!draft.functionText)
  const canConfirm = classificationReady && !identityEdited
    ? quoteMissing.length === 0 && (draft.quantity ?? 0) > 0
    : !refinementExhausted && classificationMissing.length === 0 && clarificationSatisfied
  const volume = resolvedProductVolumeCbm(draft)
  // Quantity is only a real question when nothing in the analysis implies it.
  // A supplier MOQ or a suggested quantity already answers "how many"; asking
  // again is the redundant prompt the UX audit called out.
  const quantitySignal = (analysis.suggestedQuantities?.[0] ?? 0) > 0 || (analysis.product.moq ?? 0) > 0
  const minimumQuantity = Math.max(1, Math.floor(analysis.product.moq || draft.moq || 1))
  const fxRate = fxRateInput.trim() ? Number(fxRateInput) : null
  const priceConversion = convertToUsd(draft.unitPriceUsd, priceCurrency, fxRate)

  const update = <K extends keyof ProductConfirmationData>(key: K, value: ProductConfirmationData[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const submitConfirmation = () => {
    const note = clarification.replace(/\s+/g, ' ').trim()
    const next = note
      ? applyClassificationClarification(draft, note, analysis.customs.missingFacts)
      : draft
    onConfirm(next)
    setClarification('')
  }

  // When autoConfirm is on (chatbot-originated analyses), skip the confirm form
  // automatically as soon as canConfirm becomes true (first render with enough data).
  useEffect(() => {
    if (!autoConfirm || status !== 'confirm' || !canConfirm) return
    onConfirm(draft)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConfirm, status, canConfirm])

  // Decision 2: a structured disambiguation answer re-runs the classifier through the SAME
  // refinement path as the free-text clarification (still counts against the 3-attempt budget).
  const submitDisambiguationAnswer = (note: string) => {
    onConfirm(applyClassificationClarification(draft, note, analysis.customs.missingFacts))
    setClarification('')
  }
  // A direct candidate pick resolves to a confirmed profile and routes through the existing
  // manual-NCM path (same as ManualNcmPicker), so economics use validated tariffs.
  const pickDisambiguationCandidate = (customs: CustomsProfile) => {
    onManualNcm(customs, draft)
  }

  const quoteFieldMissing = (id: string) => quoteMissing.some((item) => item.id === id)

  const applyCurrencyConversion = () => {
    if (priceCurrency === 'USD') return
    update('unitPriceUsd', priceConversion.amountUsd)
    setPriceCurrency('USD')
    setFxRateInput('')
  }

  return <section className="calculation-pipeline" id="case-confirmation" aria-busy={status === 'processing'}>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{statusAnnouncement}</div>
    {status === 'confirm' ? <>
      <div className="pipeline-confirm-head progressive-confirm-head">
        <span className="eyebrow">{classificationResolved ? 'Últimos datos para cotizar' : provisionalAvailable ? 'Estimado listo para cotizar' : 'Confirmación inteligente'}</span>
        <h2>{classificationResolved
          ? 'La NCM ya está resuelta. Sólo me falta cerrar la logística.'
          : provisionalAvailable
            ? 'Tengo un estimado de la clasificación. Completá la logística y verificá la posición antes de operar.'
            : 'Esto es lo que entendí. ¿Está bien?'}</h2>
        <p>{classificationResolved
          ? 'No vuelvo a pedirte información técnica que ya usamos. Completá únicamente los datos comerciales o físicos que Alibaba no pudo confirmar.'
          : provisionalAvailable
            ? 'Apliqué un arancel estimado conservador para que puedas avanzar. Si querés, afiná la clasificación con las opciones de abajo; si no, seguimos con el estimado.'
            : 'Confirmá el producto que detecté. Si para clasificarlo falta un dato puntual, te hago una sola pregunta clara y seguimos.'}</p>
      </div>

      <div className="pipeline-product-card progressive-product-card">
        <button type="button" className="pipeline-secondary" aria-expanded={showManualNcm} onClick={() => setShowManualNcm(value => !value)}>Buscar o cambiar posición en el nomenclador</button>
        {showManualNcm && <ManualNcmPicker customs={analysis.customs} onSelect={customs => { onManualNcm(customs, draft); setShowManualNcm(false) }} />}
        {!classificationReady ? <>
          <div className="pipeline-understood-card">
            <span className="eyebrow">Producto detectado</span>
            <p className="pipeline-understood-sentence"><strong>“{draft.productName || 'todavía no identificado'}”</strong></p>
            <div className="pipeline-known-grid">
              {knownFact('Tipo / categoría', draft.category, 'category')}
              {knownFact('Material', draft.material, 'material')}
              {knownFact('Función', draft.functionText, 'function')}
              {knownFact('Origen', draft.originCountry, 'origin')}
              {knownFact('Precio proveedor', draft.unitPriceUsd > 0 ? usd(draft.unitPriceUsd) : null, 'price')}
              {knownFact('MOQ', draft.moq > 0 ? `${draft.moq} u.` : null, 'moq')}
            </div>
            {draft.description && draft.description !== draft.productName && <details className="pipeline-source-detail"><summary>Ver detalle técnico leído</summary><p>{draft.description}</p></details>}
            <div className="pipeline-understood-actions">
              <button type="button" className="pipeline-secondary" aria-expanded={showCorrections} onClick={() => setShowCorrections((value) => !value)}>{showCorrections ? 'Ocultar correcciones' : 'Corregir datos del producto'}</button>
            </div>
          </div>

          {(classificationMissing.length > 0 || showCorrections) && <div className="pipeline-progressive-fields">
            <div className="pipeline-progressive-title"><b>{classificationMissing.length ? 'Necesito identificarlo un poco mejor.' : 'Corregí sólo lo que esté mal.'}</b><small>Estos datos sirven para la posición arancelaria; precio, peso y volumen no son necesarios todavía.</small></div>
            <label className="pipeline-confirm-field wide"><span>¿Qué producto es?</span><input value={draft.productName} onChange={(event) => update('productName', event.target.value)} placeholder="Ej. reloj de pulsera mecánico automático" /></label>
            <label className="pipeline-confirm-field"><span>Tipo / categoría, si la sabés</span><input value={draft.category} onChange={(event) => update('category', event.target.value)} placeholder="Ej. reloj mecánico" /></label>
            <label className="pipeline-confirm-field"><span>Material / composición</span><input value={draft.material} onChange={(event) => update('material', event.target.value)} placeholder="Ej. acero inoxidable" /></label>
            <label className="pipeline-confirm-field"><span>Función principal</span><input value={draft.functionText} onChange={(event) => update('functionText', event.target.value)} placeholder="Ej. medición mecánica del tiempo" /></label>
            <label className="pipeline-confirm-field wide"><span>Detalle técnico útil</span><textarea value={draft.description} onChange={(event) => update('description', event.target.value)} placeholder="Modelo, tecnología, composición o cualquier característica que diferencie el producto." rows={3} /></label>
          </div>}

          {hasDisambiguation && !refinementExhausted && <NcmDisambiguation
            disambiguation={disambiguation!}
            customs={analysis.customs}
            onPickCandidate={pickDisambiguationCandidate}
            onAnswer={submitDisambiguationAnswer}
            provisionalAvailable={provisionalAvailable}
            onContinueEstimate={provisionalAvailable ? submitConfirmation : undefined}
          />}

          {classifierAskedForMore && !(clarificationTarget === 'functionText' && !!draft.functionText) && !refinementExhausted && !(refinement && (refinement.attempt >= 2 || (refinement.attempt > 0 && clarificationTarget === 'functionText'))) && <div className="pipeline-clarification-card">
            <span className="eyebrow">Una pregunta para terminar</span>
            <div className="pipeline-clarification-copy">
              <h3>{clarificationUi.question}</h3>
              <p>{clarificationUi.helper}</p>
            </div>
            <label className="pipeline-clarification-input" htmlFor="classification-clarification">
              <span>Tu respuesta</span>
              <textarea
                id="classification-clarification"
                value={clarification}
                onChange={(event) => setClarification(event.target.value.slice(0, 1000))}
                rows={3}
                placeholder={clarificationUi.placeholder}
                aria-describedby="classification-clarification-help"
              />
              <small id="classification-clarification-help">Una frase corta alcanza. Esta aclaración no consume otro crédito.</small>
            </label>
          </div>}

          {classificationMissing.length > 0 && <div className="pipeline-warning pipeline-missing-fields" role="alert"><b>Todavía no puedo clasificarlo.</b><span>Falta: {classificationMissing.map((item) => item.label).join(' · ')}.</span></div>}
          {refinementExhausted && <div className="pipeline-warning pipeline-missing-fields" role="alert"><b>No pude cerrar una clasificación confiable.</b><span>Se usaron {refinement?.attempt} de {refinement?.maxAttempts} intentos de aclaración. Podés buscar y confirmar una posición en el nomenclador sin iniciar otro caso.</span></div>}
          {refinementExhausted && <NomencladorGuidance onManualSearch={() => setShowManualNcm(true)} />}

          <div className="pipeline-confirm-actions progressive-confirm-actions">
            {!refinementExhausted && <button type="button" className="journey-primary-action" disabled={!canConfirm} onClick={submitConfirmation}>{classifierAskedForMore ? 'Responder y continuar' : 'Confirmar y clasificar'} <UiIcon name="arrow-right" size={16} /></button>}
            <button type="button" className="pipeline-secondary" onClick={onEditProduct}>{refinementExhausted ? 'Revisar / cambiar producto' : 'Cambiar producto'}</button>
          </div>
        </> : <>
          {classificationResolved ? <div className="pipeline-classification-ready">
            <div><span className="eyebrow">Clasificación lista</span><h3>NCM {analysis.customs.ncmCandidate}</h3><p>Confianza {confidenceLabel(analysis.customs.classificationConfidence)} · derecho {analysis.customs.dutyRatePct}%</p></div>
            <span className="pipeline-classification-check" aria-hidden="true"><UiIcon name="check" size={18} /></span>
          </div> : <div className="pipeline-classification-ready is-provisional">
            <div>
              <span className="eyebrow">Estimado — verificá antes de operar</span>
              <h3>Derecho estimado {analysis.customs.provisionalDutyRatePct}%</h3>
              <p>{analysis.customs.provisionalLabel || 'Posición no confirmada'}</p>
              {analysis.customs.provisionalBasis && <small>{analysis.customs.provisionalBasis}</small>}
            </div>
            <span className="pipeline-classification-check is-provisional" aria-hidden="true"><UiIcon name="warning" size={18} /></span>
          </div>}

          {!classificationResolved && hasDisambiguation && <details className="pipeline-disambiguation-details">
            <summary>¿Querés afinar la clasificación? (opcional)</summary>
            <NcmDisambiguation
              disambiguation={disambiguation!}
              customs={analysis.customs}
              onPickCandidate={pickDisambiguationCandidate}
              onAnswer={submitDisambiguationAnswer}
            />
          </details>}

          <div className="pipeline-understood-card quote-known-card">
            <span className="eyebrow">Datos que ya tengo</span>
            <div className="pipeline-known-grid">
              {knownFact('Origen', draft.originCountry, 'origin')}
              {knownFact('FOB unitario', draft.unitPriceUsd > 0 ? usd(draft.unitPriceUsd) : null, 'price')}
              {knownFact('MOQ', draft.moq > 0 ? `${draft.moq} u.` : null, 'moq')}
              {knownFact('Peso embalado', draft.unitWeightKg > 0 ? `${draft.unitWeightKg} kg/u.` : null, 'weight')}
              {knownFact('Volumen embalado', volume > 0 ? `${volume.toFixed(6)} m³/u.` : null, 'volume')}
              {quantitySignal && knownFact('Cantidad', draft.quantity ? `${draft.quantity} u.` : null, 'quantity')}
            </div>
            <button type="button" className="pipeline-secondary" aria-expanded={showAllQuoteFields} onClick={() => setShowAllQuoteFields((value) => !value)}>{showAllQuoteFields ? 'Ocultar campos opcionales' : 'Corregir un dato detectado'}</button>
          </div>

          {draft.unitPriceUsd > 0 && <div className="pipeline-currency-confirm">
            <div className="pipeline-currency-head"><b>Confirmá el precio y la cantidad mínima</b><small>Reviso lo que extraje. Si el proveedor expresa el precio en otra moneda, pasalo a dólares oficiales antes de calcular.</small></div>
            <div className="pipeline-currency-facts">
              <div><span>Precio FOB detectado</span><b>{priceCurrency === 'USD' ? usd(draft.unitPriceUsd) : `${draft.unitPriceUsd} ${priceCurrency}`}</b></div>
              <div><span>Cantidad mínima (MOQ)</span><b>{draft.moq > 0 ? `${draft.moq} u.` : 'Sin dato'}</b></div>
            </div>
            <div className="pipeline-currency-grid">
              <label className="pipeline-confirm-field"><span>Moneda del precio del proveedor</span>
                <DsSelect
                  ariaLabel="Moneda del precio del proveedor"
                  value={priceCurrency}
                  onChange={(value) => setPriceCurrency(value as CurrencyCode)}
                  options={(Object.keys(CURRENCY_LABELS) as CurrencyCode[]).map((code) => ({ value: code, label: `${code} · ${CURRENCY_LABELS[code]}` }))}
                />
              </label>
              {priceCurrency !== 'USD' && <label className="pipeline-confirm-field"><span>Tipo de cambio (USD por 1 {priceCurrency})</span><input type="number" min="0" step="0.0001" value={fxRateInput} onChange={(event) => setFxRateInput(event.target.value)} placeholder={`${priceConversion.usdPerUnit}`} /></label>}
            </div>
            {priceCurrency !== 'USD' && <div className="pipeline-currency-preview" role="status">
              <span>{draft.unitPriceUsd} {priceCurrency} → <b>{usd(priceConversion.amountUsd)}</b> por unidad</span>
              <small>{priceConversion.note}</small>
              <button type="button" className="journey-primary-action" disabled={Number(fxRateInput) <= 0} onClick={applyCurrencyConversion}>Convertir el precio a USD <UiIcon name="arrow-right" size={16} /></button>
            </div>}
          </div>}

          {showAllQuoteFields && <div className="pipeline-progressive-fields">
            <label className="pipeline-confirm-field"><span>Nombre del producto</span><input value={draft.productName} onChange={event => update('productName', event.target.value)} /></label>
            <label className="pipeline-confirm-field"><span>Tipo / categoría</span><input value={draft.category} onChange={event => update('category', event.target.value)} /></label>
            <label className="pipeline-confirm-field"><span>Material</span><input value={draft.material} onChange={event => update('material', event.target.value)} /></label>
            <label className="pipeline-confirm-field"><span>Función</span><input value={draft.functionText} onChange={event => update('functionText', event.target.value)} /></label>
            <label className="pipeline-confirm-field wide"><span>Descripción</span><textarea value={draft.description} onChange={event => update('description', event.target.value)} /></label>
            {identityEdited && <p>Al cambiar el producto volveremos a validar su clasificación.</p>}
          </div>}
          <div className="pipeline-progressive-fields quote-missing-fields">
            <div className="pipeline-progressive-title"><b>{quoteMissing.length ? `Me ${quoteMissing.length === 1 ? 'falta' : 'faltan'} ${quoteMissing.length} ${quoteMissing.length === 1 ? 'dato' : 'datos'} para cotizar.` : 'Ya tengo todo para cotizar.'}</b><small>Pedimos sólo lo que interviene en compra o flete.</small></div>
            {!quantitySignal && !showAllQuoteFields && <div className="pipeline-quantity-prompt">
              <div className="pipeline-quantity-copy"><b>¿Con cuántas unidades arrancamos?</b><small>No necesito un número exacto ahora. Si todavía no lo definiste, arrancamos con la cantidad mínima y la optimización después prueba otras cantidades sin pasarte del presupuesto.</small></div>
              <div className="pipeline-quantity-choice">
                <button type="button" className={`pipeline-quantity-option${draft.quantity === minimumQuantity ? ' is-active' : ''}`} onClick={() => update('quantity', minimumQuantity)}><span>Traer la cantidad mínima</span><em>{minimumQuantity} u.</em></button>
                <label className="pipeline-confirm-field"><span>O indicá una cantidad</span><input type="number" min="1" step="1" value={draft.quantity || ''} onChange={event => update('quantity', Math.floor(numberValue(event.target.value)))} placeholder={`${minimumQuantity}`} /></label>
              </div>
            </div>}
            {showAllQuoteFields && <label className="pipeline-confirm-field"><span>Cantidad a cotizar (unidades)</span><input type="number" min="1" step="1" value={draft.quantity || ''} onChange={event => update('quantity', Math.floor(numberValue(event.target.value)))} /></label>}
            {(showAllQuoteFields || quoteFieldMissing('originCountry')) && <label className="pipeline-confirm-field"><span>País de origen de la mercadería</span><input value={draft.originCountry} onChange={(event) => update('originCountry', event.target.value)} placeholder="Ej. China" /></label>}
            {(showAllQuoteFields || quoteFieldMissing('unitPriceUsd')) && <label className="pipeline-confirm-field"><span>Precio FOB unitario (USD)</span><input type="number" min="0" step="0.01" value={draft.unitPriceUsd || ''} onChange={(event) => update('unitPriceUsd', numberValue(event.target.value))} /></label>}
            {(showAllQuoteFields || quoteFieldMissing('moq')) && <label className="pipeline-confirm-field"><span>MOQ / cantidad mínima (opcional)</span><input type="number" min="0" step="1" value={draft.moq || ''} onChange={(event) => update('moq', numberValue(event.target.value))} /></label>}
            {(showAllQuoteFields || quoteFieldMissing('unitWeightKg')) && <label className="pipeline-confirm-field"><span>Peso de una unidad embalada (kg)</span><input type="number" min="0" step="0.001" value={draft.unitWeightKg || ''} onChange={(event) => update('unitWeightKg', numberValue(event.target.value))} /></label>}
            {(showAllQuoteFields || quoteFieldMissing('packageVolume')) && <div className="pipeline-volume-entry wide">
              <label className="pipeline-confirm-field"><span>Volumen unitario, si lo sabés (m³)</span><input type="number" min="0" step="0.000001" value={draft.unitVolumeCbm || ''} onChange={(event) => update('unitVolumeCbm', numberValue(event.target.value))} /></label>
              <div className="pipeline-or"><span>o más fácil</span></div>
              <div className="pipeline-dimensions">
                <label><span>Largo (cm)</span><input type="number" min="0" step="0.1" value={draft.packageLengthCm || ''} onChange={(event) => update('packageLengthCm', numberValue(event.target.value))} /></label>
                <label><span>Ancho (cm)</span><input type="number" min="0" step="0.1" value={draft.packageWidthCm || ''} onChange={(event) => update('packageWidthCm', numberValue(event.target.value))} /></label>
                <label><span>Alto (cm)</span><input type="number" min="0" step="0.1" value={draft.packageHeightCm || ''} onChange={(event) => update('packageHeightCm', numberValue(event.target.value))} /></label>
              </div>
              {volume > 0 && !draft.unitVolumeCbm && <small>Volumen calculado automáticamente: {volume.toFixed(6)} m³ por unidad.</small>}
            </div>}
          </div>

          {quoteMissing.length > 0 ? <div className="pipeline-warning pipeline-missing-fields" role="alert"><b>No te voy a pedir nada más de aduana.</b><span>Sólo falta: {quoteMissing.map((item) => item.label).join(' · ')}.</span></div> : <div className="pipeline-confirm-ok"><b>Listo para cotizar.</b><span>La NCM y los datos físicos/comerciales tienen evidencia suficiente.</span></div>}

          {classificationReady && !identityEdited && (draft.quantity ?? 0) === 0 && <div className="pipeline-warning" role="alert"><b>Cantidad en cero.</b><span>Indicá cuántas unidades querés cotizar para poder calcular el costo total.</span></div>}

          <div className="pipeline-confirm-grid compact">
            <div><span>Trámite de intervención</span><b>{interventionFee ? 'USD 200 · incluido' : prefill.sensitiveCategory === 'unknown' ? 'Pendiente' : 'No aplica'}</b></div>
            <div><span>Siguiente</span><b>Flete → costo puesto → optimización</b></div>
          </div>

          <div className="pipeline-confirm-actions progressive-confirm-actions">
            <button type="button" className="journey-primary-action" disabled={!canConfirm} onClick={submitConfirmation}>Cotizar con estos datos <UiIcon name="arrow-right" size={16} /></button>
            <button type="button" className="pipeline-secondary" onClick={onEditProduct}>Cambiar producto</button>
          </div>
        </>}
      </div>
    </> : status === 'ready' ? <div className="pipeline-ready-collapsed">
      <div className="pipeline-ready-collapsed-head">
        <div>
          <span className="eyebrow">Caso calculado</span>
          <h2>Tu costo de importación está listo.</h2>
          {!classificationResolved && provisionalAvailable && <small className="pipeline-ready-provisional-note">Clasificación estimada — verificá la posición antes de operar.</small>}
        </div>
        <button type="button" className="pipeline-secondary" onClick={onReviewProduct}>Modificar datos del producto</button>
      </div>
      {summary && <div className="pipeline-ready-strip" aria-label="Resumen del cálculo completado">
        <div><span>Modo base</span><b>{summary.selectedMode === 'lcl' ? 'LCL' : summary.selectedMode === 'air' ? 'Aéreo' : 'Courier comercial'}</b></div>
        <div><span>Clasificación</span><b>{classificationResolved ? `NCM ${analysis.customs.ncmCandidate}` : 'Estimada'}</b></div>
        <div><span>Intervención</span><b>{interventionFee ? 'USD 200 incluido' : 'No aplica'}</b></div>
        <div><span>Costo puesto/u.</span><b>{usd(summary.unitCostUsd)}</b></div>
      </div>}
    </div> : silent ? <div className="pipeline-silent-status" role="status" aria-live="polite">
      <div className="pipeline-silent-spinner" aria-hidden="true" />
      <span>{status === 'blocked' ? 'Analizando la clasificación…' : 'Calculando el costo de importación…'}</span>
      {status === 'blocked' && <button type="button" className="pipeline-secondary pipeline-silent-retry" onClick={onReviewProduct}>Completar datos <UiIcon name="arrow-right" size={14} /></button>}
    </div> : <>
      <div className="pipeline-run-head">
        <div><span className="eyebrow">Motor de cálculo</span><h2>{status === 'blocked' ? 'Necesito resolver un dato antes de seguir.' : 'Construyendo tu costo de importación.'}</h2></div>
        <strong aria-hidden="true">{Math.round(progress)}%</strong>
      </div>
      <div
        className="pipeline-overall-progress"
        role="progressbar"
        aria-label="Progreso del cálculo de importación"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        aria-valuetext={`${Math.round(progress)}% completado`}
      ><span aria-hidden="true" style={{ width: `${progress}%` }} /></div>

      <div className="pipeline-steps">
        {pipelineSteps.map((item, index) => {
          const state = stageState(index, status, activeStage)
          return <div className={`pipeline-step-row ${state}`} aria-current={state === 'active' ? 'step' : undefined} key={item.title}>
            <span className="pipeline-step-icon" aria-hidden="true">{state === 'done' ? <UiIcon name="check" size={17} /> : state === 'blocked' ? <UiIcon name="warning" size={16} /> : index + 1}</span>
            <div className="pipeline-step-copy">
              <div><b>{item.title}</b><small>{state === 'active' ? 'Procesando' : state === 'done' ? 'Completo' : state === 'blocked' ? 'Revisión necesaria' : 'Pendiente'}</small></div>
              <p>{item.description}</p>
              {(state === 'done' || state === 'blocked' || state === 'active') && <em>{stageDetail(index, analysis, prefill, summary)}</em>}
              {state === 'active' && <div className="pipeline-inline-progress" aria-hidden="true"><span /></div>}
            </div>
          </div>
        })}
      </div>

      {status === 'blocked' && <div className="pipeline-blocker" role="alert" aria-atomic="true">
        <b>No voy a completar el costo con un supuesto inventado.</b>
        <p>{blocker || 'La clasificación o un dato necesario para el cálculo necesita revisión.'}</p>
        {analysis.customs.missingFacts.length > 0 && <ul>{analysis.customs.missingFacts.slice(0, 6).map((fact) => <li key={fact}>{fact}</li>)}</ul>}
        <NomencladorGuidance onManualSearch={() => setShowManualNcm(true)} />
        <div className="pipeline-confirm-actions">
          <button type="button" className="journey-primary-action" onClick={onReviewProduct}>{refinementExhausted ? 'Revisar el producto' : 'Responder lo que falta'} <UiIcon name="arrow-right" size={16} /></button>
          <button type="button" className="pipeline-secondary" onClick={onEditProduct}>Cambiar producto</button>
        </div>
      </div>}
    </>}
  </section>
}
