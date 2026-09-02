import React, { useEffect, useMemo, useState } from 'react'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'
import type { QuotePrefill } from '../lib/hotProducts'
import { usd } from '../lib/format'
import {
  missingClassificationConfirmationFields,
  missingQuoteConfirmationFields,
  productConfirmationFromAnalysis,
  resolvedProductVolumeCbm,
  type ProductConfirmationData,
} from '../lib/productConfirmation'

export type CalculationPipelineStatus = 'confirm' | 'processing' | 'blocked' | 'ready'

export type CalculationPipelineSummary = {
  baseQuantity: number
  selectedMode: 'lcl' | 'air'
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
  onEditProduct: () => void
  onReviewProduct: () => void
}

const interventionCategories = new Set(['food', 'toys', 'cosmetics', 'medicines', 'supplements'])

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
    description: 'Uso origen, peso y volumen confirmados para comparar la base de flete LCL y aéreo.',
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
    return analysis.customs.ncmCandidate
      ? `NCM ${analysis.customs.ncmCandidate} · confianza ${confidenceLabel(analysis.customs.classificationConfidence)}`
      : 'NCM pendiente de resolución'
  }
  if (index === 1) {
    if (analysis.customs.dutyRatePct === null || analysis.customs.dutyRatePct === undefined) return 'Derecho retenido hasta resolver clasificación'
    const intervention = hasInterventionFee(prefill) ? ' · Trámite intervención USD 200' : ''
    return `DIE ${analysis.customs.dutyRatePct}% · TE ${analysis.customs.statisticsRatePct}% · IVA ${analysis.customs.vatRatePct ?? 21}%${intervention}`
  }
  if (index === 2) {
    return `${prefill.originCountry} · ${prefill.unitWeightKg || 0} kg/u. · ${prefill.unitVolumeCbm || 0} m³/u.`
  }
  if (summary) return `${summary.baseQuantity} u. base · ${summary.selectedMode === 'lcl' ? 'LCL' : 'Aéreo'} · ${usd(summary.unitCostUsd)}/u.`
  return `Cantidad base: ${prefill.quantity || prefill.moq || 1} unidades`
}

function pipelineStatusAnnouncement(status: CalculationPipelineStatus, activeStage: number, blocker?: string | null, summary?: CalculationPipelineSummary | null) {
  if (status === 'confirm') return 'El cálculo espera confirmación de los datos del producto.'
  if (status === 'processing') {
    const stage = pipelineSteps[Math.min(Math.max(activeStage, 0), pipelineSteps.length - 1)]
    return `Procesando: ${stage?.title || 'cálculo de importación'}.`
  }
  if (status === 'blocked') return `Cálculo detenido. ${blocker || 'Hay un dato que necesita revisión antes de continuar.'}`
  if (summary) return `Cálculo completado. Modo ${summary.selectedMode === 'lcl' ? 'LCL' : 'aéreo'}. Costo puesto por unidad ${usd(summary.unitCostUsd)}.`
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

export default function CalculationPipeline({ analysis, prefill, status, activeStage, summary, blocker, onConfirm, onEditProduct, onReviewProduct }: Props) {
  const progress = status === 'confirm' ? 0 : status === 'ready' ? 100 : Math.min(100, Math.max(8, ((activeStage + (status === 'processing' ? 0.35 : 0)) / pipelineSteps.length) * 100))
  const interventionFee = hasInterventionFee(prefill)
  const statusAnnouncement = pipelineStatusAnnouncement(status, activeStage, blocker, summary)
  const [draft, setDraft] = useState<ProductConfirmationData>(() => productConfirmationFromAnalysis(analysis))
  const [showCorrections, setShowCorrections] = useState(false)
  const [showAllQuoteFields, setShowAllQuoteFields] = useState(false)
  const [clarification, setClarification] = useState('')

  useEffect(() => {
    // A refinement returns a new analysis with the same sourceUrl. Sync from the
    // complete analysis object so a previous clarification is never silently
    // dropped on the next round.
    setDraft(productConfirmationFromAnalysis(analysis))
    setShowCorrections(false)
    setShowAllQuoteFields(false)
    setClarification('')
  }, [analysis])

  const sourceDraft = useMemo(() => productConfirmationFromAnalysis(analysis), [analysis])
  const classificationMissing = useMemo(() => missingClassificationConfirmationFields(draft), [draft])
  const quoteMissing = useMemo(() => missingQuoteConfirmationFields(draft), [draft])
  const classificationResolved = !!analysis.customs.ncmCandidate
    && (analysis.customs.classificationConfidence === 'high' || analysis.customs.classificationConfidence === 'medium')
    && analysis.customs.dutyRatePct !== null
    && analysis.customs.dutyRatePct !== undefined
  const refinement = analysis.classificationRefinement
  const refinementExhausted = !classificationResolved
    && refinement?.allowed === false
    && refinement.maxAttempts > 0
    && refinement.attempt >= refinement.maxAttempts
  const identityEdited = !sameIdentity(draft, sourceDraft)
  const classifierAskedForMore = !classificationResolved && analysis.customs.missingFacts.length > 0
  const clarificationSatisfied = !classifierAskedForMore || identityEdited || clarification.trim().length >= 3
  const canConfirm = classificationResolved
    ? quoteMissing.length === 0
    : !refinementExhausted && classificationMissing.length === 0 && clarificationSatisfied
  const volume = resolvedProductVolumeCbm(draft)

  const update = <K extends keyof ProductConfirmationData>(key: K, value: ProductConfirmationData[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const submitConfirmation = () => {
    const note = clarification.replace(/\s+/g, ' ').trim()
    const next = note
      ? { ...draft, description: [draft.description.trim(), `Aclaración del usuario: ${note}`].filter(Boolean).join('. ') }
      : draft
    onConfirm(next)
    setClarification('')
  }

  const quoteFieldMissing = (id: string) => quoteMissing.some((item) => item.id === id)

  return <section className="calculation-pipeline" id="case-confirmation" aria-busy={status === 'processing'}>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{statusAnnouncement}</div>
    {status === 'confirm' ? <>
      <div className="pipeline-confirm-head progressive-confirm-head">
        <span className="eyebrow">{classificationResolved ? 'Últimos datos para cotizar' : 'Confirmación inteligente'}</span>
        <h2>{classificationResolved ? 'La NCM ya está resuelta. Sólo me falta cerrar la logística.' : 'Esto es lo que entendí. ¿Está bien?'}</h2>
        <p>{classificationResolved
          ? 'No vuelvo a pedirte información técnica que ya usamos. Completá únicamente los datos comerciales o físicos que Alibaba no pudo confirmar.'
          : 'No hace falta llenar una ficha aduanera. Confirmá la identidad que detecté; si el nomenclador necesita distinguir entre dos posiciones, te voy a preguntar sólo ese dato.'}</p>
      </div>

      <div className="pipeline-product-card progressive-product-card">
        {!classificationResolved ? <>
          <div className="pipeline-understood-card">
            <span className="eyebrow">Lo que entendí</span>
            <p className="pipeline-understood-sentence">Entendí que el producto es <strong>“{draft.productName || 'todavía no identificado'}”</strong>.</p>
            <div className="pipeline-known-grid">
              {knownFact('Tipo / categoría detectada', draft.category, 'category')}
              {knownFact('Material detectado', draft.material, 'material')}
              {knownFact('Función detectada', draft.functionText, 'function')}
              {knownFact('Origen detectado', draft.originCountry, 'origin')}
              {knownFact('Precio proveedor', draft.unitPriceUsd > 0 ? usd(draft.unitPriceUsd) : null, 'price')}
              {knownFact('MOQ detectado', draft.moq > 0 ? `${draft.moq} u.` : null, 'moq')}
            </div>
            {draft.description && draft.description !== draft.productName && <details className="pipeline-source-detail"><summary>Ver detalle técnico leído</summary><p>{draft.description}</p></details>}
            <div className="pipeline-understood-actions">
              <button type="button" className="pipeline-secondary" aria-expanded={showCorrections} onClick={() => setShowCorrections((value) => !value)}>{showCorrections ? 'Ocultar correcciones' : 'Algo no está bien / quiero corregir'}</button>
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

          {classifierAskedForMore && !refinementExhausted && <div className="pipeline-clarification-card">
            <span className="eyebrow">Para cerrar la posición arancelaria</span>
            <b>Me falta una aclaración concreta.</b>
            <ul>{analysis.customs.missingFacts.slice(0, 5).map((fact) => <li key={fact}>{fact}</li>)}</ul>
            <label><span>Respondeme en tus palabras</span><textarea value={clarification} onChange={(event) => setClarification(event.target.value.slice(0, 1000))} rows={3} placeholder="Ej. Sí, es automático mecánico; la caja es de acero inoxidable y no tiene funciones de smartwatch." /></label>
          </div>}

          {classificationMissing.length > 0 && <div className="pipeline-warning pipeline-missing-fields" role="alert"><b>Todavía no puedo nomenclar.</b><span>Falta: {classificationMissing.map((item) => item.label).join(' · ')}.</span></div>}
          {classifierAskedForMore && !clarificationSatisfied && !refinementExhausted && <div className="pipeline-warning pipeline-missing-fields" role="alert"><b>Necesito tu respuesta antes de reintentar.</b><span>Así evito repetir la misma clasificación dudosa.</span></div>}
          {refinementExhausted && <div className="pipeline-warning pipeline-missing-fields" role="alert"><b>No voy a repetir la misma clasificación indefinidamente.</b><span>Se usaron {refinement?.attempt} de {refinement?.maxAttempts} intentos de aclaración sin cerrar una NCM confiable. Revisá la identidad del producto o iniciá un caso nuevo; no se consumieron créditos extra por estos intentos.</span></div>}

          <div className="pipeline-confirm-actions progressive-confirm-actions">
            {!refinementExhausted && <button type="button" className="journey-primary-action" disabled={!canConfirm} onClick={submitConfirmation}>{classifierAskedForMore ? 'Usar esta aclaración y reclasificar' : 'Sí, es este producto · clasificar'} <span>→</span></button>}
            <button type="button" className="pipeline-secondary" onClick={onEditProduct}>{refinementExhausted ? 'Revisar / elegir producto' : 'Elegir otro producto'}</button>
          </div>
        </> : <>
          <div className="pipeline-classification-ready">
            <div><span className="eyebrow">Clasificación lista</span><h3>NCM {analysis.customs.ncmCandidate}</h3><p>Confianza {confidenceLabel(analysis.customs.classificationConfidence)} · derecho {analysis.customs.dutyRatePct}%</p></div>
            <span aria-hidden="true">✓</span>
          </div>

          <div className="pipeline-understood-card quote-known-card">
            <span className="eyebrow">Datos que ya tengo</span>
            <div className="pipeline-known-grid">
              {knownFact('Origen', draft.originCountry, 'origin')}
              {knownFact('FOB unitario', draft.unitPriceUsd > 0 ? usd(draft.unitPriceUsd) : null, 'price')}
              {knownFact('MOQ', draft.moq > 0 ? `${draft.moq} u.` : null, 'moq')}
              {knownFact('Peso embalado', draft.unitWeightKg > 0 ? `${draft.unitWeightKg} kg/u.` : null, 'weight')}
              {knownFact('Volumen embalado', volume > 0 ? `${volume.toFixed(6)} m³/u.` : null, 'volume')}
            </div>
            <button type="button" className="pipeline-secondary" aria-expanded={showAllQuoteFields} onClick={() => setShowAllQuoteFields((value) => !value)}>{showAllQuoteFields ? 'Mostrar sólo faltantes' : 'Corregir un dato detectado'}</button>
          </div>

          <div className="pipeline-progressive-fields quote-missing-fields">
            <div className="pipeline-progressive-title"><b>{quoteMissing.length ? `Me ${quoteMissing.length === 1 ? 'falta' : 'faltan'} ${quoteMissing.length} ${quoteMissing.length === 1 ? 'dato' : 'datos'} para cotizar.` : 'Ya tengo todo para cotizar.'}</b><small>Pedimos sólo lo que interviene en compra o flete.</small></div>
            {(showAllQuoteFields || quoteFieldMissing('originCountry')) && <label className="pipeline-confirm-field"><span>País de origen de la mercadería</span><input value={draft.originCountry} onChange={(event) => update('originCountry', event.target.value)} placeholder="Ej. China" /></label>}
            {(showAllQuoteFields || quoteFieldMissing('unitPriceUsd')) && <label className="pipeline-confirm-field"><span>Precio FOB unitario (USD)</span><input type="number" min="0" step="0.01" value={draft.unitPriceUsd || ''} onChange={(event) => update('unitPriceUsd', numberValue(event.target.value))} /></label>}
            {(showAllQuoteFields || quoteFieldMissing('moq')) && <label className="pipeline-confirm-field"><span>MOQ / cantidad mínima</span><input type="number" min="0" step="1" value={draft.moq || ''} onChange={(event) => update('moq', numberValue(event.target.value))} /></label>}
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

          <div className="pipeline-confirm-grid compact">
            <div><span>Trámite de intervención</span><b>{interventionFee ? 'USD 200 · incluido' : prefill.sensitiveCategory === 'unknown' ? 'Pendiente' : 'No aplica'}</b></div>
            <div><span>Siguiente</span><b>Flete → costo puesto → optimización</b></div>
          </div>

          <div className="pipeline-confirm-actions progressive-confirm-actions">
            <button type="button" className="journey-primary-action" disabled={!canConfirm} onClick={submitConfirmation}>Cotizar con estos datos <span>→</span></button>
            <button type="button" className="pipeline-secondary" onClick={onEditProduct}>Elegir otro producto</button>
          </div>
        </>}
      </div>
    </> : <>
      <div className="pipeline-run-head">
        <div><span className="eyebrow">Motor de cálculo</span><h2>{status === 'ready' ? 'Caso calculado.' : status === 'blocked' ? 'Necesito resolver un dato antes de seguir.' : 'Construyendo tu costo de importación.'}</h2></div>
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
            <span className="pipeline-step-icon" aria-hidden="true">{state === 'done' ? '✓' : state === 'blocked' ? '!' : index + 1}</span>
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
        <div className="pipeline-confirm-actions">
          <button type="button" className="journey-primary-action" onClick={onReviewProduct}>{refinementExhausted ? 'Revisar el producto' : 'Responder lo que falta'} <span>→</span></button>
          <button type="button" className="pipeline-secondary" onClick={onEditProduct}>Elegir otro producto</button>
        </div>
      </div>}

      {status === 'ready' && summary && <div className="pipeline-ready-strip" aria-label="Resumen del cálculo completado">
        <div><span>Clasificación</span><b>{analysis.customs.ncmCandidate}</b></div>
        <div><span>Modo base</span><b>{summary.selectedMode === 'lcl' ? 'LCL' : 'Aéreo'}</b></div>
        <div><span>Intervención</span><b>{interventionFee ? 'USD 200 incluido' : 'No aplica'}</b></div>
        <div><span>Costo puesto/u.</span><b>{usd(summary.unitCostUsd)}</b></div>
      </div>}
    </>}
  </section>
}
