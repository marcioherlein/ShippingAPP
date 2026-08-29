import React, { useEffect, useMemo, useState } from 'react'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'
import type { QuotePrefill } from '../lib/hotProducts'
import { usd } from '../lib/format'
import {
  missingProductConfirmationFields,
  productConfirmationFromAnalysis,
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
    description: 'Cruzo la ficha confirmada —descripción, material y función— contra el nomenclador NCM completo.',
  },
  {
    title: 'Aranceles y costos automáticos',
    description: 'Cargo derecho, tasa estadística, IVA y percepciones. Si el producto cae en un grupo con intervención, sumo USD 200 de trámite automáticamente.',
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

function numberValue(value: string) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export default function CalculationPipeline({ analysis, prefill, status, activeStage, summary, blocker, onConfirm, onEditProduct, onReviewProduct }: Props) {
  const progress = status === 'confirm' ? 0 : status === 'ready' ? 100 : Math.min(100, Math.max(8, ((activeStage + (status === 'processing' ? 0.35 : 0)) / pipelineSteps.length) * 100))
  const interventionFee = hasInterventionFee(prefill)
  const [draft, setDraft] = useState<ProductConfirmationData>(() => productConfirmationFromAnalysis(analysis))

  useEffect(() => {
    setDraft(productConfirmationFromAnalysis(analysis))
  }, [analysis.sourceUrl])

  const missing = useMemo(() => missingProductConfirmationFields(draft), [draft])
  const canConfirm = missing.length === 0
  const update = <K extends keyof ProductConfirmationData>(key: K, value: ProductConfirmationData[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  return <section className="calculation-pipeline" id="case-confirmation">
    {status === 'confirm' ? <>
      <div className="pipeline-confirm-head">
        <span className="eyebrow">Gate obligatorio de producto</span>
        <h2>Confirmá y completá la ficha antes de clasificar.</h2>
        <p>Lo que pudo leer Alibaba o Parse.bot aparece precargado. Corregí cualquier dato incorrecto y completá los faltantes. ShippingAPP no inicia NCM, aranceles ni cotización hasta que esta ficha tenga evidencia suficiente.</p>
      </div>

      <div className="pipeline-product-card">
        <div className="pipeline-product-title">
          <div><span>Ficha del producto</span><h3>{draft.productName || 'Producto pendiente de identificar'}</h3><small>{prefill.sourceLabel}</small></div>
          <span className="pipeline-confidence">{analysis.confidence.overall}% auto</span>
        </div>

        <div className="pipeline-confirm-form">
          <label className="pipeline-confirm-field wide"><span>Nombre exacto *</span><input value={draft.productName} onChange={(event) => update('productName', event.target.value)} placeholder="Ej. reloj de pulsera mecánico automático 42.5 mm" /></label>
          <label className="pipeline-confirm-field"><span>Categoría / tipo *</span><input value={draft.category} onChange={(event) => update('category', event.target.value)} placeholder="Ej. Mechanical Watches" /></label>
          <label className="pipeline-confirm-field"><span>Origen de la mercadería *</span><input value={draft.originCountry} onChange={(event) => update('originCountry', event.target.value)} placeholder="Ej. China" /></label>
          <label className="pipeline-confirm-field wide"><span>Descripción técnica</span><textarea value={draft.description} onChange={(event) => update('description', event.target.value)} placeholder="Qué es, cómo funciona y características que distinguen el producto." rows={3} /></label>
          <label className="pipeline-confirm-field"><span>Material / composición</span><input value={draft.material} onChange={(event) => update('material', event.target.value)} placeholder="Ej. acero inoxidable" /></label>
          <label className="pipeline-confirm-field"><span>Función principal</span><input value={draft.functionText} onChange={(event) => update('functionText', event.target.value)} placeholder="Ej. medición mecánica del tiempo" /></label>
          <label className="pipeline-confirm-field"><span>FOB unitario (USD) *</span><input type="number" min="0" step="0.01" value={draft.unitPriceUsd || ''} onChange={(event) => update('unitPriceUsd', numberValue(event.target.value))} /></label>
          <label className="pipeline-confirm-field"><span>MOQ / cantidad mínima *</span><input type="number" min="0" step="1" value={draft.moq || ''} onChange={(event) => update('moq', numberValue(event.target.value))} /></label>
          <label className="pipeline-confirm-field"><span>Peso unitario embalado (kg) *</span><input type="number" min="0" step="0.001" value={draft.unitWeightKg || ''} onChange={(event) => update('unitWeightKg', numberValue(event.target.value))} /></label>
          <label className="pipeline-confirm-field"><span>Volumen unitario embalado (m³) *</span><input type="number" min="0" step="0.000001" value={draft.unitVolumeCbm || ''} onChange={(event) => update('unitVolumeCbm', numberValue(event.target.value))} /></label>
        </div>

        <div className="pipeline-confirm-grid compact">
          <div><span>Trámite de intervención</span><b>{interventionFee ? 'USD 200 · incluido' : prefill.sensitiveCategory === 'unknown' ? 'Pendiente' : 'No aplica'}</b></div>
          <div><span>Secuencia</span><b>Ficha → NCM → aranceles → flete → costo</b></div>
        </div>

        {missing.length > 0 ? <div className="pipeline-warning pipeline-missing-fields"><b>No se puede continuar todavía.</b><span>Completá: {missing.map((item) => item.label).join(' · ')}.</span></div> : <div className="pipeline-confirm-ok"><b>Ficha completa.</b><span>Al confirmar, estos datos quedan congelados para la corrida de NCM y costos.</span></div>}

        <div className="pipeline-confirm-actions">
          <button type="button" className="journey-primary-action" disabled={!canConfirm} onClick={() => onConfirm(draft)}>Confirmar ficha y clasificar <span>→</span></button>
          <button type="button" className="pipeline-secondary" onClick={onEditProduct}>Cambiar producto</button>
        </div>
      </div>
    </> : <>
      <div className="pipeline-run-head">
        <div><span className="eyebrow">Motor de cálculo</span><h2>{status === 'ready' ? 'Caso calculado.' : status === 'blocked' ? 'Necesito un dato antes de poder cotizar.' : 'Construyendo tu costo de importación.'}</h2></div>
        <strong>{Math.round(progress)}%</strong>
      </div>
      <div className="pipeline-overall-progress" aria-label={`Progreso ${Math.round(progress)}%`}><span style={{ width: `${progress}%` }} /></div>

      <div className="pipeline-steps">
        {pipelineSteps.map((item, index) => {
          const state = stageState(index, status, activeStage)
          return <div className={`pipeline-step-row ${state}`} key={item.title}>
            <span className="pipeline-step-icon">{state === 'done' ? '✓' : state === 'blocked' ? '!' : index + 1}</span>
            <div className="pipeline-step-copy">
              <div><b>{item.title}</b><small>{state === 'active' ? 'Procesando' : state === 'done' ? 'Completo' : state === 'blocked' ? 'Revisión necesaria' : 'Pendiente'}</small></div>
              <p>{item.description}</p>
              {(state === 'done' || state === 'blocked' || state === 'active') && <em>{stageDetail(index, analysis, prefill, summary)}</em>}
              {state === 'active' && <div className="pipeline-inline-progress"><span /></div>}
            </div>
          </div>
        })}
      </div>

      {status === 'blocked' && <div className="pipeline-blocker">
        <b>No voy a completar economics con un supuesto inventado.</b>
        <p>{blocker || 'La clasificación o un dato necesario para el cálculo necesita revisión.'}</p>
        {analysis.customs.missingFacts.length > 0 && <ul>{analysis.customs.missingFacts.slice(0, 6).map((fact) => <li key={fact}>{fact}</li>)}</ul>}
        <div className="pipeline-confirm-actions">
          <button type="button" className="journey-primary-action" onClick={onReviewProduct}>Completar / corregir ficha <span>→</span></button>
          <button type="button" className="pipeline-secondary" onClick={onEditProduct}>Cambiar producto</button>
        </div>
      </div>}

      {status === 'ready' && summary && <div className="pipeline-ready-strip">
        <div><span>Clasificación</span><b>{analysis.customs.ncmCandidate}</b></div>
        <div><span>Modo base</span><b>{summary.selectedMode === 'lcl' ? 'LCL' : 'Aéreo'}</b></div>
        <div><span>Intervención</span><b>{interventionFee ? 'USD 200 incluido' : 'No aplica'}</b></div>
        <div><span>Costo puesto/u.</span><b>{usd(summary.unitCostUsd)}</b></div>
      </div>}
    </>}
  </section>
}
