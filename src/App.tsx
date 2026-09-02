import React, { useMemo, useRef, useState } from 'react'
import UrlAnalyzer from './components/UrlAnalyzer'
import HotProductsSection from './components/HotProductsSection'
import OwnedProductIntake from './components/OwnedProductIntake'
import CalculationPipeline, { type CalculationPipelineStatus, type CalculationPipelineSummary } from './components/CalculationPipeline'
import ImportQuoteFlow, { type JourneyQuoteSetup } from './components/ImportQuoteFlow'
import { getCachedHotProducts, hotProductToQuotePrefill, type QuotePrefill } from './lib/hotProducts'
import type { HotProduct } from './data/hotProducts'
import { enrichProductAnalysisV2, ingestAlibabaUrlV2, type ProductAnalysisV2 } from './lib/productAnalysisV2'
import { compareLandedCost, type ImportEntityType, type ImportPurpose, type SensitiveProductCategory } from './lib/landedCostEngine'
import { getJourneyBudgetError } from './lib/journeyValidation'
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
  return 'Pendiente'
}

function entityLabel(value: ImportEntityType | null) {
  if (value === 'company') return 'Empresa'
  if (value === 'individual') return 'Persona humana'
  if (value === 'unknown') return 'Todavía no sé'
  return 'Pendiente'
}

function signatureLabel(value: SignatureAnswer | null) {
  if (value === 'yes') return 'Sí, tengo firma/importador'
  if (value === 'no') return 'No tengo firma/importador'
  if (value === 'unknown') return 'Todavía no sé'
  return 'Pendiente'
}

function sensitiveLabel(value: SensitiveProductCategory | null) {
  if (value === 'none') return 'No es categoría sensible'
  if (value === 'food') return 'Alimentos'
  if (value === 'toys') return 'Juguetes'
  if (value === 'cosmetics') return 'Cosméticos'
  if (value === 'medicines') return 'Medicamentos'
  if (value === 'supplements') return 'Suplementos'
  if (value === 'unknown') return 'Todavía no sé'
  return 'Pendiente'
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
  const [selectedHotProduct, setSelectedHotProduct] = useState<HotProduct | null>(null)
  const [selectionLoading, setSelectionLoading] = useState(false)
  const [selectionError, setSelectionError] = useState('')
  const [calculationStatus, setCalculationStatus] = useState<CalculationPipelineStatus>('confirm')
  const [pipelineStage, setPipelineStage] = useState(0)
  const [pipelineSummary, setPipelineSummary] = useState<CalculationPipelineSummary | null>(null)
  const [pipelineBlocker, setPipelineBlocker] = useState<string | null>(null)
  const [calculationInputKey, setCalculationInputKey] = useState<string | null>(null)

  const hotProducts = useMemo(() => getCachedHotProducts(8), [])
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

  const selectedPrefill = useMemo<QuotePrefill | null>(() => {
    if (analysisPrefill) return analysisPrefill
    if (selectedHotProduct) {
      const base = hotProductToQuotePrefill(selectedHotProduct)
      return { ...base, budgetUsd: budgetMode === 'budget' ? budgetUsd : base.budgetUsd }
    }
    return null
  }, [selectedHotProduct, analysisPrefill, budgetMode, budgetUsd])

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
    setSelectionError('')
  }

  const chooseIntent = (next: Exclude<EntryIntent, null>) => {
    setIntent(next)
    setAnalysis(null)
    setSelectedHotProduct(null)
    resetPipeline()
    setStep(1)
  }

  const handleAnalysis = (next: ProductAnalysisV2) => {
    setAnalysis(next)
    setSelectedHotProduct(null)
    resetPipeline()
    setStep(3)
    window.setTimeout(() => document.getElementById('case-confirmation')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
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

  const handleHotProductQuote = async (product: HotProduct) => {
    if (selectionLoading) return
    setSelectedHotProduct(product)
    setSelectionLoading(true)
    setSelectionError('')
    resetPipeline()
    try {
      const next = await ingestAlibabaUrlV2(product.productUrl)
      handleAnalysis(next)
    } catch (error) {
      setAnalysis(createManualProductAnalysis(product.productUrl))
      setSelectionError(error instanceof Error ? `${error.message} Podés completar sólo lo que falte abajo.` : 'No pudimos hacer la ingesta profunda. Podés completar sólo lo que falte abajo.')
      window.setTimeout(() => document.getElementById('case-confirmation')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
    } finally {
      setSelectionLoading(false)
    }
  }

  const editSelectedProduct = () => {
    setSelectedHotProduct(null)
    resetPipeline()
    setStep(3)
    setAnalysis(null)
    if (intent === 'have_product') {
      window.setTimeout(() => document.querySelector('.owned-product-intake')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
      return
    }
    window.setTimeout(() => document.querySelector('.journey-product-surface')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  const reviewProductData = () => {
    setCalculationStatus('confirm')
    setPipelineStage(0)
    setPipelineSummary(null)
    setPipelineBlocker(null)
    setCalculationInputKey(null)
    window.setTimeout(() => document.getElementById('case-confirmation')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
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
      window.setTimeout(() => document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
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
    setSelectedHotProduct(null)
    setSelectionLoading(false)
    resetPipeline()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const productStatusLabel = analysis
    ? effectiveCalculationStatus === 'ready' ? 'Calculado' : effectiveCalculationStatus === 'processing' ? 'Procesando' : effectiveCalculationStatus === 'blocked' ? 'Falta una respuesta' : 'Esperando confirmación'
    : selectionLoading ? 'Leyendo publicación' : intent === 'have_product' && step >= 3 ? 'Esperando producto' : 'Pendiente'

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
      <div className="journey-stepper" aria-label="Progreso de la cotización">
        {stepLabels.map((label, index) => <div className={`journey-step${index < progressStep ? ' done' : ''}${index === progressStep ? ' active' : ''}`} key={label}>
          <span>{index < progressStep ? '✓' : index + 1}</span><small>{label}</small>
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
          <button type="button" onClick={() => chooseIntent('have_product')}><span>▣</span><b>Ya tengo un producto</b><small>Tengo una publicación, proveedor o sé qué quiero traer.</small></button>
          <button type="button" onClick={() => chooseIntent('search_product')}><span>⌕</span><b>Quiero buscarlo</b><small>Describilo en lenguaje natural y ShippingAPP busca opciones en Alibaba.</small></button>
          <button type="button" onClick={() => chooseIntent('discover')}><span>✦</span><b>Quiero descubrir</b><small>Buscá en Alibaba o explorá oportunidades listas para cotizar.</small></button>
        </div> : <div className="journey-bubble user"><div><b>{intent === 'have_product' ? 'Ya tengo el producto.' : intent === 'search_product' ? 'Quiero buscar un producto.' : 'Quiero explorar oportunidades.'}</b><button type="button" onClick={() => setStep(0)}>Cambiar</button></div></div>}

        {intent && <>
          <div className="journey-bubble assistant">
            <span className="journey-avatar">S</span>
            <div><b>Antes de cotizar necesito entender cómo vas a importar.</b><p>Estas respuestas pueden cambiar impuestos, gastos y requisitos. Si algo no lo sabés, marcá “No sé” y lo dejamos visible como pendiente.</p></div>
          </div>

          <section className={`journey-question-card${step === 1 ? ' active' : ''}`}>
            <div className="journey-question-head"><span>01</span><div><b>Perfil de la operación</b><small>Cuatro decisiones que afectan el costo real.</small></div>{step > 1 && <button type="button" onClick={() => setStep(1)}>Editar</button>}</div>
            {step === 1 ? <div className="journey-question-fields">
              <div><label>¿Para qué lo traés?</label><div className="journey-chip-row"><button className={purpose === 'resale' ? 'selected' : ''} onClick={() => setPurpose('resale')} type="button">Reventa</button><button className={purpose === 'own_use' ? 'selected' : ''} onClick={() => setPurpose('own_use')} type="button">Uso propio</button><button className={purpose === 'unknown' ? 'selected' : ''} onClick={() => setPurpose('unknown')} type="button">No sé</button></div></div>
              <div><label>¿Quién importa?</label><div className="journey-chip-row"><button className={entityType === 'company' ? 'selected' : ''} onClick={() => setEntityType('company')} type="button">Empresa</button><button className={entityType === 'individual' ? 'selected' : ''} onClick={() => setEntityType('individual')} type="button">Persona</button><button className={entityType === 'unknown' ? 'selected' : ''} onClick={() => setEntityType('unknown')} type="button">No sé</button></div></div>
              <div><label>¿Tenés firma/importador para operar?</label><div className="journey-chip-row"><button className={signature === 'yes' ? 'selected' : ''} onClick={() => setSignature('yes')} type="button">Sí</button><button className={signature === 'no' ? 'selected' : ''} onClick={() => setSignature('no')} type="button">No</button><button className={signature === 'unknown' ? 'selected' : ''} onClick={() => setSignature('unknown')} type="button">No sé</button></div></div>
              <div><label>¿Es una categoría sensible?</label><select value={sensitiveCategory || ''} onChange={(event) => setSensitiveCategory(event.target.value as SensitiveProductCategory)}><option value="" disabled>Elegir</option><option value="none">No</option><option value="food">Alimentos</option><option value="toys">Juguetes</option><option value="cosmetics">Cosméticos</option><option value="medicines">Medicamentos</option><option value="supplements">Suplementos</option><option value="unknown">No sé</option></select></div>
              <button className="journey-primary-action" type="button" disabled={!operationAnswered} onClick={continueOperation}>Seguir con presupuesto <span>→</span></button>
            </div> : <div className="journey-complete-row"><span>{purposeLabel(purpose)}</span><span>{entityLabel(entityType)}</span><span>{signatureLabel(signature)}</span><span>{sensitiveLabel(sensitiveCategory)}</span></div>}
          </section>

          {step >= 2 && <>
            <div className="journey-bubble assistant">
              <span className="journey-avatar">S</span>
              <div><b>Ahora definamos el tamaño posible de la operación.</b><p>USD 1.000, USD 10.000 y USD 50.000 son problemas logísticos distintos. También podés pensar en un rango de unidades o decir que todavía no lo sabés.</p></div>
            </div>
            <section className={`journey-question-card${step === 2 ? ' active' : ''}`}>
              <div className="journey-question-head"><span>02</span><div><b>Presupuesto o rango</b><small>Esto limita las cantidades que vale la pena simular.</small></div>{step > 2 && <button type="button" onClick={() => setStep(2)}>Editar</button>}</div>
              {step === 2 ? <div className="journey-question-fields">
                <div className="journey-choice-grid budget">
                  <button className={budgetMode === 'budget' ? 'selected' : ''} type="button" onClick={() => setBudgetMode('budget')}><b>Tengo presupuesto</b><small>Quiero maximizar lo que puedo traer sin pasarme.</small></button>
                  <button className={budgetMode === 'units' ? 'selected' : ''} type="button" onClick={() => setBudgetMode('units')}><b>Tengo rango de unidades</b><small>Sé más o menos cuántas quiero probar.</small></button>
                  <button className={budgetMode === 'unknown' ? 'selected' : ''} type="button" onClick={() => setBudgetMode('unknown')}><b>Todavía no sé</b><small>Calculame escenarios para entender el orden de magnitud.</small></button>
                </div>
                {budgetMode === 'budget' && <label className="journey-number-field"><span>Presupuesto máximo total</span><div><small>USD</small><input type="number" min="1" step="500" value={budgetUsd} aria-invalid={!!budgetError} aria-describedby={budgetError ? 'journey-budget-error' : undefined} onChange={(event) => setBudgetUsd(Number(event.target.value))} /></div><em>Usamos costo final estimado, no sólo compra FOB.</em></label>}
                {budgetMode === 'units' && <div className="journey-range-fields"><label><span>Desde</span><input type="number" min="1" step="1" value={unitsMin} aria-invalid={!!budgetError} aria-describedby={budgetError ? 'journey-budget-error' : undefined} onChange={(event) => setUnitsMin(Number(event.target.value))} /></label><label><span>Hasta</span><input type="number" min="1" step="1" value={unitsMax} aria-invalid={!!budgetError} aria-describedby={budgetError ? 'journey-budget-error' : undefined} onChange={(event) => setUnitsMax(Number(event.target.value))} /></label></div>}
                {budgetError && <div className="pipeline-warning" id="journey-budget-error" role="alert"><b>Revisá presupuesto o rango.</b><span>{budgetError}</span></div>}
                <button className="journey-primary-action" type="button" disabled={!budgetAnswered} onClick={continueBudget}>Seguir con el producto <span>→</span></button>
              </div> : <div className="journey-complete-row"><span>{budgetMode === 'budget' ? `Hasta USD ${budgetUsd.toLocaleString('es-AR')}` : budgetMode === 'units' ? `${unitsMin}–${unitsMax} unidades` : 'Cantidad/presupuesto por definir'}</span></div>}
            </section>
          </>}

          {step >= 3 && <>
            <div className="journey-bubble assistant">
              <span className="journey-avatar">S</span>
              <div>
                <b>{intent === 'have_product' ? '¿Tenés el link o preferís contarme qué producto es?' : intent === 'search_product' ? 'Describime el producto como se lo explicarías a una persona.' : 'Buscá en Alibaba o elegí una oportunidad lista.'}</b>
                <p>{intent === 'have_product'
                  ? 'Si pegás el link, intento traer los datos automáticamente. Si no, describilo en una frase. En ambos casos confirmamos lo que entendí y sólo te pregunto lo imprescindible.'
                  : intent === 'search_product'
                    ? 'Podés escribir “buscame paletas de pádel de carbono hasta USD 30 y MOQ menor a 100”, pegar un link o describir lo que necesitás.'
                    : 'Escribí cualquier producto para buscarlo en Alibaba. Si sólo querés explorar, abajo siguen disponibles oportunidades cacheadas sin iniciar una búsqueda nueva.'}</p>
              </div>
            </div>

            {intent === 'have_product' && !analysis && <div className="journey-product-surface"><OwnedProductIntake onAlibabaLink={handleOwnedProductLink} onDescribeProduct={handleOwnedProductDescription} /></div>}

            {intent === 'search_product' && <div className="journey-product-surface"><UrlAnalyzer deferCalculation onAnalysis={handleAnalysis} onManualFallback={handleManualFallback} analysis={analysis} /></div>}

            {intent === 'discover' && <>
              <div className="journey-product-surface"><UrlAnalyzer deferCalculation mode="discovery" onAnalysis={handleAnalysis} onManualFallback={handleManualFallback} analysis={analysis} /></div>
              <div className="journey-product-surface">
                <div className="journey-section-heading"><span className="eyebrow">O explorar sin buscar</span><h2>Oportunidades cacheadas</h2><p>Al elegir una, ShippingAPP abre la publicación real y completa lo que pueda; cualquier faltante se confirma con preguntas puntuales.</p></div>
                <HotProductsSection products={hotProducts} selectedId={selectedHotProduct?.id ?? null} onQuote={handleHotProductQuote} />
                {selectionLoading && <div className="journey-selection-status"><span className="journey-spinner" /><div><b>Leyendo la publicación seleccionada</b><p>Estoy intentando completar identidad, precio, MOQ y logística antes de pedirte confirmación.</p></div></div>}
                {selectionError && <div className="pipeline-warning"><b>La fuente automática quedó incompleta.</b><span>{selectionError}</span></div>}
              </div>
            </>}
          </>}
        </>}
      </div>

      <aside className="journey-case-summary">
        <div className="journey-summary-sticky">
          <span className="eyebrow">Caso en construcción</span>
          <h2>{selectedPrefill?.productName || (intent === 'have_product' ? 'Tu producto' : 'Nueva importación')}</h2>
          <div className="journey-summary-list">
            <div><span>Objetivo</span><b>{intent === 'have_product' ? 'Cotizar producto propio' : intent === 'search_product' ? 'Buscar + cotizar' : intent === 'discover' ? 'Descubrir + cotizar' : 'Pendiente'}</b></div>
            <div><span>Uso</span><b>{purposeLabel(purpose)}</b></div>
            <div><span>Importador</span><b>{entityLabel(entityType)}</b></div>
            <div><span>Firma</span><b>{signatureLabel(signature)}</b></div>
            <div><span>Capacidad</span><b>{budgetMode === 'budget' ? `USD ${budgetUsd.toLocaleString('es-AR')}` : budgetMode === 'units' ? `${unitsMin}–${unitsMax} u.` : budgetMode === 'unknown' ? 'A definir' : 'Pendiente'}</b></div>
            <div><span>Producto</span><b>{productStatusLabel}</b></div>
          </div>
          <div className="journey-summary-note"><span>La lógica</span><p>Identidad confirmada → NCM → completar sólo datos faltantes de compra/flete → costo puesto → optimización. Si una posición es dudosa, la app pregunta antes de seguir.</p></div>
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
      <div className="journey-section-heading"><span className="eyebrow">Resultado del caso</span><h2>Primero entendé el costo de una unidad. Después optimizamos.</h2><p>El costo unitario se calcula dentro de la cantidad base/MOQ seleccionada, distribuyendo flete y gastos fijos. Debajo podés ver cómo cambia al traer más o menos unidades.</p></div>
      <ImportQuoteFlow key={`${analysisPrefill.productName}-${analysisPrefill.ncmCode}-${budgetMode}-${budgetUsd}-${unitsMin}-${unitsMax}-${purpose}-${entityType}-${signature}-${sensitiveCategory}`} prefill={analysisPrefill} setup={quoteSetup} />
    </section>}

    <section className="journey-output-explainer">
      <div><span>01</span><b>Identificar</b><p>Pegás un link o describís el producto. ShippingAPP confirma en lenguaje simple qué entendió.</p></div>
      <div><span>02</span><b>NCM</b><p>Clasifico con los datos técnicos disponibles. Si hay duda, pregunto sólo el atributo que distingue la posición.</p></div>
      <div><span>03</span><b>Cotizar</b><p>Con la NCM resuelta, pido únicamente origen, FOB, MOQ, peso o medidas que todavía falten.</p></div>
      <div><span>04</span><b>Optimizar</b><p>Flete, costo puesto y escenarios de cantidad según presupuesto, stock y modo logístico.</p></div>
    </section>
  </main>
}
