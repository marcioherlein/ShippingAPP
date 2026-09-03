import React, { useMemo, useRef, useState } from 'react'
import UrlAnalyzer from './components/UrlAnalyzer'
import OwnedProductIntake from './components/OwnedProductIntake'
import CalculationPipeline, { type CalculationPipelineStatus, type CalculationPipelineSummary } from './components/CalculationPipeline'
import ImportQuoteFlow, { type JourneyQuoteSetup } from './components/ImportQuoteFlow'
import UiIcon from './components/UiIcon'
import type { QuotePrefill } from './lib/hotProducts'
import { enrichProductAnalysisV2, ingestAlibabaUrlV2, type ProductAnalysisV2 } from './lib/productAnalysisV2'
import { compareLandedCost, type ImportEntityType, type ImportPurpose, type SensitiveProductCategory } from './lib/landedCostEngine'
import { getJourneyBudgetError } from './lib/journeyValidation'
import { scrollElementIntoView, scrollWindowToTop } from './lib/motionPreference'
import {
  applyProductConfirmation,
  createManualProductAnalysis,
  missingClassificationConfirmationFields,
  missingQuoteConfirmationFields,
  productConfirmationFromAnalysis,
  type ProductConfirmationData,
} from './lib/productConfirmation'

type EntryIntent = 'have_product' | 'search_product' | 'discover' | null
type BudgetMode = 'budget' | 'units' | 'unknown' | null
type SignatureAnswer = 'yes' | 'no' | 'unknown'

const stepLabels = ['Objetivo', 'Tu operación', 'Presupuesto', 'Producto', 'Resultado']

function purposeLabel(value: ImportPurpose | null) {
  if (value === 'resale') return 'Reventa'
  if (value === 'own_use') return 'Uso propio'
  if (value === 'unknown') return 'Todavía no sé'
  return 'Sin responder'
}

function entityLabel(value: ImportEntityType | null) {
  if (value === 'company') return 'Empresa'
  if (value === 'individual') return 'Persona humana'
  if (value === 'unknown') return 'Todavía no sé'
  return 'Sin responder'
}

function signatureLabel(value: SignatureAnswer | null) {
  if (value === 'yes') return 'Sí, tengo firma/importador'
  if (value === 'no') return 'No tengo firma/importador'
  if (value === 'unknown') return 'Todavía no sé'
  return 'Sin responder'
}

function sensitiveLabel(value: SensitiveProductCategory | null) {
  if (value === 'none') return 'No es categoría sensible'
  if (value === 'food') return 'Alimentos'
  if (value === 'toys') return 'Juguetes'
  if (value === 'cosmetics') return 'Cosméticos'
  if (value === 'medicines') return 'Medicamentos'
  if (value === 'supplements') return 'Suplementos'
  if (value === 'unknown') return 'Todavía no sé'
  return 'Sin responder'
}

function makeAnalysisPrefill(
  analysis: ProductAnalysisV2,
  budgetMode: BudgetMode,
  budgetUsd: number,
  sensitiveCategory: SensitiveProductCategory | null,
): QuotePrefill {
  const fx = analysis.fx?.status === 'live' && analysis.fx.arsPerUsd && analysis.fx.arsPerUsd > 0 ? analysis.fx.arsPerUsd : null
  const estimatedLocalUsd = fx && analysis.market.estimatedPriceArs ? analysis.market.estimatedPriceArs / fx : 0
  const confirmedQuantity = analysis.product.moq || analysis.suggestedQuantities[0] || 0
  return {
    productName: analysis.product.name,
    originCountry: analysis.product.originCountry || '',
    quantity: confirmedQuantity,
    unitPriceUsd: analysis.product.unitPriceUsd || 0,
    unitWeightKg: analysis.product.packedWeightKg || 0,
    unitVolumeCbm: analysis.product.volumeCbm || 0,
    moq: analysis.product.moq || 0,
    budgetUsd: budgetMode === 'budget' ? budgetUsd : 0,
    monthlyDemand: analysis.market.estimatedMonthlyDemand || 0,
    localSellPriceUsd: estimatedLocalUsd,
    sensitiveCategory: sensitiveCategory || 'unknown',
    sourceLabel: analysis.sourceUrl.startsWith('manual://')
      ? 'Producto descripto por el usuario'
      : analysis.sourceUrl.startsWith('chat://')
        ? 'Datos aportados en conversación'
        : 'Producto leído por ShippingAPP',
    ncmCode: analysis.customs.ncmCandidate,
    simCode: analysis.customs.simOpeningCandidate?.code ?? null,
    classificationConfidence: analysis.customs.classificationConfidence,
    dutyRatePct: analysis.customs.dutyRatePct,
    statisticsRatePct: analysis.customs.statisticsRatePct,
    vatRatePct: analysis.customs.vatRatePct ?? null,
    vatAdditionalRatePct: analysis.customs.vatAdditionalRatePct ?? null,
    gainsRatePct: analysis.customs.gainsRatePct ?? null,
    iibbRatePct: analysis.customs.iibbRatePct ?? null,
    capitalGoodEligible: analysis.customs.capitalGoodEligible ?? false,
    customsSource: analysis.customs.source,
    customsSourceDate: analysis.customs.catalogSourceDate || analysis.customs.reviewedAt,
    customsMissingFacts: analysis.customs.missingFacts,
    customsRationale: analysis.customs.rationale,
  }
}

function nextPaint(ms = 180) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

function hasUsableClassification(analysis: ProductAnalysisV2) {
  return !!analysis.customs.ncmCandidate
    && (analysis.customs.classificationConfidence === 'high' || analysis.customs.classificationConfidence === 'medium')
    && analysis.customs.dutyRatePct !== null
    && analysis.customs.dutyRatePct !== undefined
}

export default function App() {
  const [intent, setIntent] = useState<EntryIntent>(null)
  const [step, setStep] = useState(0)
  const [purpose, setPurpose] = useState<ImportPurpose | null>(null)
  const [entityType, setEntityType] = useState<ImportEntityType | null>(null)
  const [signature, setSignature] = useState<SignatureAnswer | null>(null)
  const [sensitiveCategory, setSensitiveCategory] = useState<SensitiveProductCategory | null>(null)
  const [budgetMode, setBudgetMode] = useState<BudgetMode>(null)
  const [budgetUsd, setBudgetUsd] = useState(10000)
  const [unitsMin, setUnitsMin] = useState(50)
  const [unitsMax, setUnitsMax] = useState(200)
  const [analysis, setAnalysis] = useState<ProductAnalysisV2 | null>(null)
  const [calculationStatus, setCalculationStatus] = useState<CalculationPipelineStatus>('confirm')
  const [pipelineStage, setPipelineStage] = useState(0)
  const [pipelineSummary, setPipelineSummary] = useState<CalculationPipelineSummary | null>(null)
  const [pipelineBlocker, setPipelineBlocker] = useState<string | null>(null)
  const [calculationInputKey, setCalculationInputKey] = useState<string | null>(null)

  const operationAnswered = purpose !== null && entityType !== null && signature !== null && sensitiveCategory !== null
  const budgetError = getJourneyBudgetError({ mode: budgetMode, budgetUsd, unitsMin, unitsMax })
  const budgetAnswered = budgetMode !== null && budgetError === null

  const currentCalculationInputKey = useMemo(() => JSON.stringify([
    purpose,
    entityType,
    signature,
    sensitiveCategory,
    budgetMode,
    budgetUsd,
    unitsMin,
    unitsMax,
  ]), [purpose, entityType, signature, sensitiveCategory, budgetMode, budgetUsd, unitsMin, unitsMax])
  const currentCalculationInputKeyRef = useRef(currentCalculationInputKey)
  currentCalculationInputKeyRef.current = currentCalculationInputKey

  const effectiveCalculationStatus: CalculationPipelineStatus = calculationInputKey && calculationInputKey !== currentCalculationInputKey
    ? 'confirm'
    : calculationStatus

  const analysisPrefill = useMemo<QuotePrefill | null>(() => {
    if (!analysis) return null
    return makeAnalysisPrefill(analysis, budgetMode, budgetUsd, sensitiveCategory)
  }, [analysis, budgetMode, budgetUsd, sensitiveCategory])

  const quoteSetup = useMemo<JourneyQuoteSetup>(() => ({
    budgetUsd: budgetMode === 'budget' ? budgetUsd : 0,
    quantity: budgetMode === 'units' ? Math.max(unitsMin, Math.round((unitsMin + unitsMax) / 2)) : undefined,
    purpose: purpose || 'unknown',
    entityType: entityType || 'unknown',
    hasImporterSignature: signature || 'unknown',
    sensitiveCategory: sensitiveCategory || 'unknown',
  }), [budgetMode, budgetUsd, unitsMin, unitsMax, purpose, entityType, signature, sensitiveCategory])

  const progressStep = effectiveCalculationStatus === 'ready' ? 4 : step

  const resetPipeline = () => {
    setCalculationStatus('confirm')
    setPipelineStage(0)
    setPipelineSummary(null)
    setPipelineBlocker(null)
    setCalculationInputKey(null)
  }

  const chooseIntent = (next: Exclude<EntryIntent, null>) => {
    setIntent(next)
    setAnalysis(null)
    resetPipeline()
    setStep(1)
  }

  const handleAnalysis = (next: ProductAnalysisV2) => {
    setAnalysis(next)
    resetPipeline()
    setStep(3)
    window.setTimeout(() => scrollElementIntoView(document.getElementById('case-confirmation')), 0)
  }

  const handleManualFallback = (sourceUrl?: string) => {
    handleAnalysis(createManualProductAnalysis(sourceUrl || 'manual://product'))
  }

  const handleOwnedProductLink = async (url: string) => {
    const next = await ingestAlibabaUrlV2(url)
    handleAnalysis(next)
  }

  const handleOwnedProductDescription = (description: string) => {
    handleAnalysis(createManualProductAnalysis('manual://product', description))
  }

  const editSelectedProduct = () => {
    resetPipeline()
    setStep(3)
    setAnalysis(null)
    if (intent === 'have_product') {
      window.setTimeout(() => scrollElementIntoView(document.querySelector('.owned-product-intake')), 0)
      return
    }
    window.setTimeout(() => scrollElementIntoView(document.querySelector('.journey-product-surface')), 0)
  }

  const reviewProductData = () => {
    setCalculationStatus('confirm')
    setPipelineStage(0)
    setPipelineSummary(null)
    setPipelineBlocker(null)
    setCalculationInputKey(null)
    window.setTimeout(() => scrollElementIntoView(document.getElementById('case-confirmation')), 0)
  }

  const confirmAndCalculate = async (confirmedProduct: ProductConfirmationData) => {
    if (!analysis) return

    const classificationMissing = missingClassificationConfirmationFields(confirmedProduct)
    if (classificationMissing.length > 0) {
      setPipelineBlocker(`Todavía no puedo identificar el producto con seguridad: ${classificationMissing.map((item) => item.label).join(', ')}.`)
      setCalculationStatus('blocked')
      setPipelineStage(0)
      return
    }

    const runInputKey = currentCalculationInputKey
    const confirmedAnalysis = applyProductConfirmation(analysis, confirmedProduct)
    setAnalysis(confirmedAnalysis)
    setCalculationInputKey(runInputKey)
    setCalculationStatus('processing')
    setPipelineStage(0)
    setPipelineSummary(null)
    setPipelineBlocker(null)

    try {
      const refreshed = hasUsableClassification(confirmedAnalysis)
        ? confirmedAnalysis
        : await enrichProductAnalysisV2(confirmedAnalysis)
      setAnalysis(refreshed)

      if (!refreshed.customs.ncmCandidate || refreshed.customs.classificationConfidence === 'missing') {
        setPipelineStage(0)
        setPipelineBlocker('No pude cerrar una NCM con la identidad disponible. Te voy a pedir únicamente el detalle técnico que permita distinguir la posición correcta.')
        setCalculationStatus('blocked')
        return
      }

      if (refreshed.customs.classificationConfidence === 'low') {
        setPipelineStage(0)
        setPipelineBlocker('La clasificación quedó con confianza baja. Necesito una aclaración concreta antes de aceptar la NCM; no voy a cotizar con una posición dudosa.')
        setCalculationStatus('blocked')
        return
      }

      await nextPaint()
      setPipelineStage(1)

      if (refreshed.customs.dutyRatePct === null || refreshed.customs.dutyRatePct === undefined) {
        setPipelineBlocker('La NCM no tiene un derecho utilizable confirmado en el motor. ShippingAPP detiene la cotización antes de inventar un arancel.')
        setCalculationStatus('blocked')
        return
      }

      const quoteMissing = missingQuoteConfirmationFields(productConfirmationFromAnalysis(refreshed))
      if (quoteMissing.length > 0) {
        setPipelineStage(2)
        setPipelineBlocker(`La NCM ya quedó resuelta. Para cotizar sólo falta: ${quoteMissing.map((item) => item.label).join(', ')}.`)
        setCalculationStatus('blocked')
        return
      }

      const prefill = makeAnalysisPrefill(refreshed, budgetMode, budgetUsd, sensitiveCategory)
      await nextPaint()
      setPipelineStage(2)

      const baseQuantity = quoteSetup.quantity ?? prefill.quantity ?? prefill.moq
      if (!baseQuantity || baseQuantity <= 0) {
        setPipelineBlocker('Necesito una cantidad base positiva para distribuir flete y gastos por unidad.')
        setCalculationStatus('blocked')
        return
      }

      const comparison = compareLandedCost({
        originCountry: prefill.originCountry,
        quantity: baseQuantity,
        unitPriceUsd: prefill.unitPriceUsd,
        unitWeightKg: prefill.unitWeightKg,
        unitVolumeCbm: prefill.unitVolumeCbm,
        dutyRatePct: refreshed.customs.dutyRatePct,
        statisticsRatePct: refreshed.customs.statisticsRatePct,
        vatRatePct: refreshed.customs.vatRatePct,
        vatAdditionalRatePct: refreshed.customs.vatAdditionalRatePct,
        gainsRatePct: refreshed.customs.gainsRatePct,
        iibbRatePct: refreshed.customs.iibbRatePct,
        purpose: purpose || 'unknown',
        entityType: entityType || 'unknown',
        hasImporterSignature: signature === null || signature === 'unknown' ? null : signature === 'yes',
        sensitiveCategory: sensitiveCategory || 'unknown',
        capitalGoodEligible: refreshed.customs.capitalGoodEligible ?? false,
        capitalGoodUse: false,
      })

      if (comparison.status !== 'ok' || !comparison.bestMode) {
        setPipelineBlocker(comparison.status === 'missing_origin'
          ? `No hay una tarifa de flete cargada para ${prefill.originCountry}.`
          : 'Con estos datos todavía no puedo comparar un modo logístico accionable.')
        setCalculationStatus('blocked')
        return
      }

      await nextPaint()
      setPipelineStage(3)
      const winner = comparison.modes[comparison.bestMode]
      const completedSummary: CalculationPipelineSummary = {
        baseQuantity,
        selectedMode: comparison.bestMode,
        unitCostUsd: winner.unitCostUsd,
        totalCostUsd: winner.totalCostUsd,
        freightCostUsd: winner.freightCostUsd,
      }

      if (currentCalculationInputKeyRef.current !== runInputKey) {
        setCalculationStatus('confirm')
        setPipelineStage(0)
        setPipelineSummary(null)
        setPipelineBlocker(null)
        return
      }

      setPipelineSummary(completedSummary)
      window.dispatchEvent(new CustomEvent('shippingapp:analysis-completed', {
        detail: {
          input: {
            intent,
            purpose: purpose || 'unknown',
            entityType: entityType || 'unknown',
            signature: signature || 'unknown',
            sensitiveCategory: sensitiveCategory || 'unknown',
            budgetMode: budgetMode || 'unknown',
            budgetUsd,
            unitsMin,
            unitsMax,
            productName: refreshed.product.name,
            sourceUrl: refreshed.sourceUrl,
          },
          result: {
            analysis: refreshed,
            pipelineSummary: completedSummary,
          },
        },
      }))
      await nextPaint(120)
      setCalculationStatus('ready')
      setStep(4)
      window.setTimeout(() => scrollElementIntoView(document.getElementById('calculator')), 80)
    } catch (error) {
      setPipelineBlocker(error instanceof Error ? error.message : 'El pipeline no pudo completar el cálculo.')
      setCalculationStatus('blocked')
    }
  }

  const continueOperation = () => {
    if (operationAnswered) setStep(2)
  }

  const continueBudget = () => {
    if (!budgetAnswered) return
    setStep(3)
  }

  const resetJourney = () => {
    setIntent(null)
    setStep(0)
    setPurpose(null)
    setEntityType(null)
    setSignature(null)
    setSensitiveCategory(null)
    setBudgetMode(null)
    setAnalysis(null)
    resetPipeline()
    scrollWindowToTop()
  }

  const productStatusLabel = analysis
    ? effectiveCalculationStatus === 'ready' ? 'Calculado' : effectiveCalculationStatus === 'processing' ? 'Procesando' : effectiveCalculationStatus === 'blocked' ? 'Falta una respuesta' : 'Listo para revisar'
    : step >= 3 ? 'Elegí o cargá un producto' : 'Todavía no elegido'

  return <main className="journey-app" id="home">
    <header className="journey-topbar">
      <a className="journey-brand" href="#home"><span className="journey-brand-mark">S</span><span>Shipping<b>APP</b></span></a>
      <div className="journey-top-actions"><span className="journey-live-dot">Motor de importación activo</span><button type="button" onClick={resetJourney}>Nuevo caso</button></div>
    </header>

    <section className="journey-hero">
      <div className="journey-orb journey-orb-one" aria-hidden="true" />
      <div className="journey-orb journey-orb-two" aria-hidden="true" />
      <span className="eyebrow">AI Import Copilot</span>
      <h1>Contame qué querés importar.<br />Yo construyo el caso.</h1>
      <p>ShippingAPP te guía desde la idea o el proveedor hasta el costo final puesto en Argentina, compara flete y simula la cantidad que tiene más sentido para tu presupuesto.</p>
      <div className="journey-stepper" role="region" aria-label="Progreso de la cotización" tabIndex={0}>
        {stepLabels.map((label, index) => <div className={`journey-step${index < progressStep ? ' done' : ''}${index === progressStep ? ' active' : ''}`} key={label}>
          <span>{index < progressStep ? <UiIcon name="check" size={16} /> : index + 1}</span><small>{label}</small>
        </div>)}
      </div>
    </section>

    <section className="journey-workspace">
      <div className="journey-conversation">
        <div className="journey-thread-label"><span>ShippingAPP</span><small>Tu caso se arma mientras conversamos</small></div>

        <div className="journey-bubble assistant">
          <span className="journey-avatar">S</span>
          <div><b>Primero: ¿desde dónde arrancamos?</b><p>No necesito que sepas de aduana. Elegí lo que mejor describe tu situación.</p></div>
        </div>

        {intent === null ? <div className="journey-choice-grid three">
          <button type="button" onClick={() => chooseIntent('have_product')}><span><UiIcon name="product" size={20} /></span><b>Ya tengo un producto</b><small>Tengo una publicación, proveedor o sé qué quiero traer.</small></button>
          <button type="button" onClick={() => chooseIntent('search_product')}><span><UiIcon name="search" size={20} /></span><b>Quiero buscarlo</b><small>Describilo en lenguaje natural y ShippingAPP busca opciones reales en Alibaba.</small></button>
          <button type="button" onClick={() => chooseIntent('discover')}><span><UiIcon name="sparkles" size={20} /></span><b>Quiero explorar</b><small>Buscá ideas de producto usando la misma búsqueda real, sin catálogo cacheado.</small></button>
        </div> : <div className="journey-bubble user"><div><b>{intent === 'have_product' ? 'Ya tengo el producto.' : intent === 'search_product' ? 'Quiero buscar un producto.' : 'Quiero explorar productos.'}</b><button type="button" onClick={() => setStep(0)}>Cambiar</button></div></div>}

        {intent && <>
          <div className="journey-bubble assistant">
            <span className="journey-avatar">S</span>
            <div><b>Antes de cotizar necesito entender cómo vas a importar.</b><p>Estas respuestas pueden cambiar impuestos, gastos y requisitos. Si algo no lo sabés, marcá “No sé”; no voy a disfrazarlo como un dato confirmado.</p></div>
          </div>

          <section className={`journey-question-card${step === 1 ? ' active' : ''}`}>
            <div className="journey-question-head"><span>01</span><div><b>Perfil de la operación</b><small>Cuatro decisiones que afectan el costo real.</small></div>{step > 1 && <button type="button" onClick={() => setStep(1)}>Editar</button>}</div>
            {step === 1 ? <div className="journey-question-fields">
              <div><label>¿Para qué lo traés?</label><div className="journey-chip-row"><button className={purpose === 'resale' ? 'selected' : ''} onClick={() => setPurpose('resale')} type="button">Reventa</button><button className={purpose === 'own_use' ? 'selected' : ''} onClick={() => setPurpose('own_use')} type="button">Uso propio</button><button className={purpose === 'unknown' ? 'selected' : ''} onClick={() => setPurpose('unknown')} type="button">No sé</button></div></div>
              <div><label>¿Quién importa?</label><div className="journey-chip-row"><button className={entityType === 'company' ? 'selected' : ''} onClick={() => setEntityType('company')} type="button">Empresa</button><button className={entityType === 'individual' ? 'selected' : ''} onClick={() => setEntityType('individual')} type="button">Persona</button><button className={entityType === 'unknown' ? 'selected' : ''} onClick={() => setEntityType('unknown')} type="button">No sé</button></div></div>
              <div><label>¿Tenés firma/importador para operar?</label><div className="journey-chip-row"><button className={signature === 'yes' ? 'selected' : ''} onClick={() => setSignature('yes')} type="button">Sí</button><button className={signature === 'no' ? 'selected' : ''} onClick={() => setSignature('no')} type="button">No</button><button className={signature === 'unknown' ? 'selected' : ''} onClick={() => setSignature('unknown')} type="button">No sé</button></div></div>
              <div><label htmlFor="journey-sensitive-category">¿Qué tipo de producto es?</label><small>Esto sirve para detectar si hay intervención especial. Si no sabés, elegí “No sé”.</small><select id="journey-sensitive-category" value={sensitiveCategory || ''} onChange={(event) => setSensitiveCategory(event.target.value as SensitiveProductCategory)}><option value="" disabled>Elegir una opción</option><option value="none">Ninguna de estas categorías</option><option value="food">Alimentos</option><option value="toys">Juguetes</option><option value="cosmetics">Cosméticos</option><option value="medicines">Medicamentos</option><option value="supplements">Suplementos</option><option value="unknown">No sé</option></select></div>
              <button className="journey-primary-action" type="button" disabled={!operationAnswered} onClick={continueOperation}>Seguir con presupuesto <span><UiIcon name="arrow-right" size={18} /></span></button>
            </div> : <div className="journey-complete-row"><span>{purposeLabel(purpose)}</span><span>{entityLabel(entityType)}</span><span>{signatureLabel(signature)}</span><span>{sensitiveLabel(sensitiveCategory)}</span></div>}
          </section>

          {step >= 2 && <>
            <div className="journey-bubble assistant">
              <span className="journey-avatar">S</span>
              <div><b>Ahora definamos el tamaño posible de la operación.</b><p>Podés darme presupuesto, rango de unidades o decir que todavía no lo sabés.</p></div>
            </div>
            <section className={`journey-question-card${step === 2 ? ' active' : ''}`}>
              <div className="journey-question-head"><span>02</span><div><b>Presupuesto o rango</b><small>Esto limita las cantidades que vale la pena simular.</small></div>{step > 2 && <button type="button" onClick={() => setStep(2)}>Editar</button>}</div>
              {step === 2 ? <div className="journey-question-fields">
                <div className="journey-choice-grid budget">
                  <button className={budgetMode === 'budget' ? 'selected' : ''} type="button" onClick={() => setBudgetMode('budget')}><b>Tengo presupuesto</b><small>Quiero maximizar lo que puedo traer sin pasarme.</small></button>
                  <button className={budgetMode === 'units' ? 'selected' : ''} type="button" onClick={() => setBudgetMode('units')}><b>Tengo rango de unidades</b><small>Sé más o menos cuántas quiero probar.</small></button>
                  <button className={budgetMode === 'unknown' ? 'selected' : ''} type="button" onClick={() => setBudgetMode('unknown')}><b>Todavía no sé</b><small>Quiero entender primero el orden de magnitud.</small></button>
                </div>
                {budgetMode === 'budget' && <label className="journey-number-field"><span>Presupuesto máximo total</span><div><small>USD</small><input type="number" min="1" step="500" value={budgetUsd} aria-invalid={!!budgetError} aria-describedby={budgetError ? 'journey-budget-error' : undefined} onChange={(event) => setBudgetUsd(Number(event.target.value))} /></div><em>Incluye compra, flete e impuestos estimados.</em></label>}
                {budgetMode === 'units' && <div className="journey-range-fields"><label><span>Mínimo de unidades</span><input type="number" min="1" step="1" value={unitsMin} aria-invalid={!!budgetError} aria-describedby={budgetError ? 'journey-budget-error' : undefined} onChange={(event) => setUnitsMin(Number(event.target.value))} /></label><label><span>Máximo de unidades</span><input type="number" min="1" step="1" value={unitsMax} aria-invalid={!!budgetError} aria-describedby={budgetError ? 'journey-budget-error' : undefined} onChange={(event) => setUnitsMax(Number(event.target.value))} /></label></div>}
                {budgetError && <div className="pipeline-warning" id="journey-budget-error" role="alert"><b>Revisá presupuesto o rango.</b><span>{budgetError}</span></div>}
                <button className="journey-primary-action" type="button" disabled={!budgetAnswered} onClick={continueBudget}>Seguir con el producto <span><UiIcon name="arrow-right" size={18} /></span></button>
              </div> : <div className="journey-complete-row"><span>{budgetMode === 'budget' ? `Hasta USD ${budgetUsd.toLocaleString('es-AR')}` : budgetMode === 'units' ? `${unitsMin}–${unitsMax} unidades` : 'Todavía sin cantidad definida'}</span></div>}
            </section>
          </>}

          {step >= 3 && <>
            <div className="journey-bubble assistant">
              <span className="journey-avatar">S</span>
              <div>
                <b>{intent === 'have_product' ? '¿Tenés el link o preferís contarme qué producto es?' : '¿Qué producto querés buscar?'}</b>
                <p>{intent === 'have_product'
                  ? 'Pegá el link de Alibaba o describí el producto. Después confirmamos sólo la información que realmente haga falta.'
                  : 'Escribí producto + material/uso y, si querés, precio máximo o MOQ. También podés pegar directamente un link de Alibaba.'}</p>
              </div>
            </div>

            {intent === 'have_product' && !analysis && <div className="journey-product-surface"><OwnedProductIntake onAlibabaLink={handleOwnedProductLink} onDescribeProduct={handleOwnedProductDescription} /></div>}

            {(intent === 'search_product' || intent === 'discover') && <div className="journey-product-surface"><UrlAnalyzer deferCalculation mode={intent === 'discover' ? 'discovery' : 'intake'} onAnalysis={handleAnalysis} onManualFallback={handleManualFallback} analysis={analysis} /></div>}
          </>}
        </>}
      </div>

      <aside className="journey-case-summary">
        <div className="journey-summary-sticky">
          <span className="eyebrow">Caso en construcción</span>
          <h2>{analysisPrefill?.productName || (intent === 'have_product' ? 'Tu producto' : 'Nueva importación')}</h2>
          <div className="journey-summary-list">
            <div><span>Objetivo</span><b>{intent === 'have_product' ? 'Cotizar producto propio' : intent === 'search_product' ? 'Buscar + cotizar' : intent === 'discover' ? 'Explorar + cotizar' : 'Sin elegir'}</b></div>
            <div><span>Uso</span><b>{purposeLabel(purpose)}</b></div>
            <div><span>Importador</span><b>{entityLabel(entityType)}</b></div>
            <div><span>Firma</span><b>{signatureLabel(signature)}</b></div>
            <div><span>Capacidad</span><b>{budgetMode === 'budget' ? `USD ${budgetUsd.toLocaleString('es-AR')}` : budgetMode === 'units' ? `${unitsMin}–${unitsMax} u.` : budgetMode === 'unknown' ? 'Todavía no definida' : 'Sin responder'}</b></div>
            <div><span>Producto</span><b>{productStatusLabel}</b></div>
          </div>
          <div className="journey-summary-note"><span>La lógica</span><p>Producto real → confirmar identidad → NCM → pedir sólo datos faltantes de compra/flete → costo puesto → optimización.</p></div>
        </div>
      </aside>
    </section>

    {analysis && analysisPrefill && <section className="journey-pipeline-section">
      <CalculationPipeline
        analysis={analysis}
        prefill={analysisPrefill}
        status={effectiveCalculationStatus}
        activeStage={pipelineStage}
        summary={pipelineSummary}
        blocker={pipelineBlocker}
        onConfirm={(product) => void confirmAndCalculate(product)}
        onEditProduct={editSelectedProduct}
        onReviewProduct={reviewProductData}
      />
    </section>}

    {analysisPrefill && effectiveCalculationStatus === 'ready' && <section className="journey-calculator-section" id="calculator">
      <div className="journey-section-heading"><span className="eyebrow">Resultado del caso</span><h2>Primero entendé el costo de una unidad. Después optimizamos.</h2><p>El costo unitario se calcula dentro de la cantidad base/MOQ seleccionada, distribuyendo flete y gastos fijos.</p></div>
      <ImportQuoteFlow key={`${analysisPrefill.productName}-${analysisPrefill.ncmCode}-${budgetMode}-${budgetUsd}-${unitsMin}-${unitsMax}-${purpose}-${entityType}-${signature}-${sensitiveCategory}`} prefill={analysisPrefill} setup={quoteSetup} />
    </section>}

    <section className="journey-output-explainer">
      <div><span>01</span><b>Identificar</b><p>Pegás un link, buscás o describís el producto.</p></div>
      <div><span>02</span><b>NCM</b><p>Clasifico con los datos técnicos disponibles y pregunto sólo si falta algo decisivo.</p></div>
      <div><span>03</span><b>Cotizar</b><p>Con la NCM resuelta, pido únicamente precio, origen, MOQ, peso o medidas que falten.</p></div>
      <div><span>04</span><b>Optimizar</b><p>Comparo flete, costo puesto y escenarios de cantidad.</p></div>
    </section>
  </main>
}
