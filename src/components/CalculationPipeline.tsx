import React from 'react'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'
import type { QuotePrefill } from '../lib/hotProducts'
import { usd } from '../lib/format'

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
  onConfirm: () => void
  onEditProduct: () => void
}

const interventionCategories = new Set(['food', 'toys', 'cosmetics', 'medicines', 'supplements'])

const pipelineSteps = [
  {
    title: 'Clasificación arancelaria',
    description: 'Cruzo descripción, material y función contra el nomenclador NCM completo.',
  },
  {
    title: 'Aranceles y costos automáticos',
    description: 'Cargo derecho, tasa estadística, IVA y percepciones. Si el producto cae en un grupo con intervención, sumo USD 200 de trámite automáticamente.',
  },
  {
    title: 'Logística internacional',
    description: 'Uso origen, peso y volumen para comparar la base de flete LCL y aéreo.',
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

export default function CalculationPipeline({ analysis, prefill, status, activeStage, summary, blocker, onConfirm, onEditProduct }: Props) {
  const progress = status === 'confirm' ? 0 : status === 'ready' ? 100 : Math.min(100, Math.max(8, ((activeStage + (status === 'processing' ? 0.35 : 0)) / pipelineSteps.length) * 100))
  const interventionFee = hasInterventionFee(prefill)

  return <section className="calculation-pipeline" id="case-confirmation">
    {status === 'confirm' ? <>
      <div className="pipeline-confirm-head">
        <span className="eyebrow">Producto listo para procesar</span>
        <h2>Confirmá los datos antes de calcular.</h2>
        <p>Después de confirmar, ShippingAPP valida la clasificación NCM, toma los aranceles del nomenclador, aplica automáticamente los costos correspondientes —incluido el trámite de USD 200 cuando el producto pertenece a un grupo con intervención— y cruza la tabla de fletes para construir el costo puesto por unidad.</p>
      </div>

      <div className="pipeline-product-card">
        <div className="pipeline-product-title">
          <div><span>Producto seleccionado</span><h3>{prefill.productName}</h3><small>{prefill.sourceLabel}</small></div>
          <span className="pipeline-confidence">{analysis.confidence.overall}% datos</span>
        </div>
        <div className="pipeline-confirm-grid">
          <div><span>Origen</span><b>{prefill.originCountry || 'Pendiente'}</b></div>
          <div><span>FOB unitario</span><b>{prefill.unitPriceUsd > 0 ? usd(prefill.unitPriceUsd) : 'Pendiente'}</b></div>
          <div><span>MOQ / cantidad base</span><b>{prefill.moq || prefill.quantity || 'Pendiente'} u.</b></div>
          <div><span>Peso unitario</span><b>{prefill.unitWeightKg > 0 ? `${prefill.unitWeightKg} kg` : 'Pendiente'}</b></div>
          <div><span>Volumen unitario</span><b>{prefill.unitVolumeCbm > 0 ? `${prefill.unitVolumeCbm} m³` : 'Pendiente'}</b></div>
          <div><span>Trámite de intervención</span><b>{interventionFee ? 'USD 200 · incluido' : prefill.sensitiveCategory === 'unknown' ? 'Pendiente' : 'No aplica'}</b></div>
        </div>
        {(prefill.unitPriceUsd <= 0 || prefill.unitWeightKg <= 0 || prefill.unitVolumeCbm <= 0) && <div className="pipeline-warning"><b>Faltan datos físicos/comerciales.</b><span>Podemos intentar clasificar, pero el costo logístico no será confiable hasta completar precio, peso y volumen.</span></div>}
        <div className="pipeline-confirm-actions">
          <button type="button" className="journey-primary-action" onClick={onConfirm}>Confirmar y calcular <span>→</span></button>
          <button type="button" className="pipeline-secondary" onClick={onEditProduct}>Cambiar producto</button>
        </div>
      </div>
    </> : <>
      <div className="pipeline-run-head">
        <div><span className="eyebrow">Motor de cálculo</span><h2>{status === 'ready' ? 'Caso calculado.' : status === 'blocked' ? 'Necesito resolver un punto antes de seguir.' : 'Construyendo tu costo de importación.'}</h2></div>
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
        {analysis.customs.missingFacts.length > 0 && <ul>{analysis.customs.missingFacts.slice(0, 5).map((fact) => <li key={fact}>{fact}</li>)}</ul>}
        <button type="button" className="pipeline-secondary" onClick={onEditProduct}>Volver al producto</button>
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
