import PurchaseQuoteResult, { type PurchaseQuoteSnapshot } from './components/PurchaseQuoteResult'
import { buildPurchasePlan, type PurchaseCapacity } from './lib/purchasePlan'
import { readCaseConversation, writeCaseConversation } from './lib/caseConversation'
import { readProductDraft, writeProductDraft, clearProductDraft } from './lib/productDraft'
import { savePendingConfirm, loadPendingConfirm, clearPendingConfirm } from './lib/sessionDraft'
import { ApiAuthError, getSessionState, subscribeSession } from './lib/authSession'
import { beginOperation, canResume, operationIsCurrent, readOperation, settleOperation } from './lib/pendingOperation'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supplierQuotePrice } from './lib/supplierQuote'
import { startImportAnalysis } from './lib/productAnalysis'
import UrlAnalyzer from './components/UrlAnalyzer'
import OwnedProductIntake from './components/OwnedProductIntake'
import CalculationPipeline, { type CalculationPipelineStatus, type CalculationPipelineSummary } from './components/CalculationPipeline'
import ImportQuoteFlow, { type JourneyQuoteSetup } from './components/ImportQuoteFlow'
import Landing from './components/Landing'
import AppHeader from './components/AppHeader'
import DsSelect from './components/DsSelect'
import UiIcon from './components/UiIcon'
import type { QuotePrefill } from './lib/hotProducts'
import { enrichProductAnalysisV2, ingestAlibabaUrlV2, hasConfirmedClassification, effectiveDutyRatePct, effectiveTariffProfile, type ProductAnalysisV2 } from './lib/productAnalysisV2'
import { compareLandedCost, type ImportEntityType, type ImportPurpose, type SensitiveProductCategory } from './lib/landedCostEngine'
import { getJourneyBudgetError } from './lib/journeyValidation'
import { scrollIntoViewIfNeeded, scrollWindowToTop } from './lib/motionPreference'
import { translateProductLabel } from './lib/productTranslation'
import {
  applyClassificationClarification,
  applyProductConfirmation,
  classificationClarificationTarget,
  createManualProductAnalysis,
  createPrefilledAnalysis,
  missingClassificationConfirmationFields,
  missingQuoteConfirmationFields,
  productConfirmationFromAnalysis,
  type ManualProductChatData,
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

function makeAnalysisPrefill(
  analysis: ProductAnalysisV2,
  budgetMode: BudgetMode,
  budgetUsd: number,
  sensitiveCategory: SensitiveProductCategory | null,
): QuotePrefill {
  const fx = analysis.fx?.status === 'live' && analysis.fx.arsPerUsd && analysis.fx.arsPerUsd > 0 ? analysis.fx.arsPerUsd : null
  const estimatedLocalUsd = fx && analysis.market.estimatedPriceArs ? analysis.market.estimatedPriceArs / fx : 0
  const marketDetails = (analysis.market as typeof analysis.market & {
    details?: {
      status?: QuotePrefill['marketStatus']
      p25Ars?: number | null
      medianArs?: number | null
      p75Ars?: number | null
      comparableCount?: number
      confidence?: number | null
      comparables?: Array<{ id?: string; title?: string; priceArs?: number; permalink?: string }>
    }
  }).details
  const marketComparables = (marketDetails?.comparables || [])
    .filter((item) => item.id && item.title && Number(item.priceArs) > 0)
    .slice(0, 4)
    .map((item) => ({
      id: String(item.id),
      title: String(item.title),
      priceArs: Number(item.priceArs),
      ...(item.permalink?.startsWith('https://') ? { permalink: item.permalink } : {}),
    }))
  const confirmedQuantity = analysis.product.purchaseQuantity || 0
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
    localSellPriceUsd: marketDetails?.status === 'live' && (marketDetails.comparableCount || marketComparables.length) > 0 ? estimatedLocalUsd : 0,
    marketPriceArs: analysis.market.estimatedPriceArs,
    marketP25Ars: marketDetails?.p25Ars ?? null,
    marketMedianArs: marketDetails?.medianArs ?? null,
    marketP75Ars: marketDetails?.p75Ars ?? null,
    marketComparableCount: marketDetails?.comparableCount ?? marketComparables.length,
    marketConfidence: marketDetails?.confidence ?? null,
    marketStatus: marketDetails?.status ?? 'unknown',
    marketSource: analysis.market.source,
    marketComparables,
    fxArsPerUsd: fx,
    fxSourceDate: analysis.fx?.sourceDate ?? null,
    fxSourceLabel: analysis.fx?.source ?? null,
    sensitiveCategory: sensitiveCategory || 'unknown',
    sourceLabel: analysis.sourceUrl.startsWith('manual://')
      ? 'Producto descripto por el usuario'
      : analysis.sourceUrl.startsWith('chat://')
        ? 'Datos aportados en conversación'
        : 'Producto leído por GlobalShipping',
    ncmCode: analysis.customs.ncmCandidate,
    simCode: analysis.customs.simOpeningCandidate?.code ?? null,
    classificationConfidence: analysis.customs.classificationConfidence,
    dutyRatePct: effectiveDutyRatePct(analysis.customs),
    statisticsRatePct: analysis.customs.statisticsRatePct ?? effectiveTariffProfile(analysis.customs)?.tePct ?? null,
    vatRatePct: analysis.customs.vatRatePct ?? effectiveTariffProfile(analysis.customs)?.vatPct ?? null,
    vatAdditionalRatePct: analysis.customs.vatAdditionalRatePct ?? effectiveTariffProfile(analysis.customs)?.vatAdditionalPct ?? null,
    gainsRatePct: analysis.customs.gainsRatePct ?? effectiveTariffProfile(analysis.customs)?.gainsPct ?? null,
    iibbRatePct: analysis.customs.iibbRatePct ?? effectiveTariffProfile(analysis.customs)?.iibbPct ?? null,
    capitalGoodEligible: analysis.customs.capitalGoodEligible ?? effectiveTariffProfile(analysis.customs)?.capitalGoodEligible ?? false,
    customsSource: analysis.customs.source,
    customsSourceDate: analysis.customs.catalogSourceDate || analysis.customs.reviewedAt,
    customsMissingFacts: analysis.customs.missingFacts,
    customsRationale: analysis.customs.rationale,
    provisional: false,
    provisionalBasis: null,
    provisionalCode: null,
    provisionalLabel: null,
  }
}

function nextPaint(ms = 180) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

function hasUsableClassification(analysis: ProductAnalysisV2) {
  return hasConfirmedClassification(analysis.customs)
}

const ENTERED_KEY = 'shippingapp:entered'
const JOURNEY_STORAGE_KEY = 'shippingapp:journey:v1'
const ANALYSIS_DRAFT_KEY = 'shippingapp:product-draft:analysis'

// A saved journey URL or storage entry means work is in flight — those users
// land straight in the app, not on the marketing screen.
function hasPendingRestore() {
  if (typeof window === 'undefined') return false
  try {
    if (new URL(window.location.href).searchParams.has('journey')) return true
    if (localStorage.getItem(JOURNEY_STORAGE_KEY)) return true
  } catch { /* storage may be unavailable */ }
  return false
}

function readInitialEntered() {
  if (typeof window === 'undefined') return false
  try {
    if (localStorage.getItem(ENTERED_KEY) === '1') return true
  } catch { /* storage may be unavailable */ }
  try {
    if (sessionStorage.getItem(ANALYSIS_DRAFT_KEY)) return true
  } catch { /* storage may be unavailable */ }
  return hasPendingRestore()
}

type PipelineDraft = {
  approvedQuantity?: number | null
  status: 'ready'
  pipelineSummary: CalculationPipelineSummary
  pipelineStage: number
  calculationInputKey: string
}

export default function App() {
  const resetDialog = useRef<HTMLDialogElement>(null)
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
  const [approvedQuantity, setApprovedQuantity] = useState<number | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [frozenQuote, setFrozenQuote] = useState<PurchaseQuoteSnapshot | null>(null)
  const [analysis, setAnalysis] = useState<ProductAnalysisV2 | null>(null)
  const [calculationStatus, setCalculationStatus] = useState<CalculationPipelineStatus>('confirm')
  const [pipelineStage, setPipelineStage] = useState(0)
  const [pipelineSummary, setPipelineSummary] = useState<CalculationPipelineSummary | null>(null)
  const [pipelineBlocker, setPipelineBlocker] = useState<string | null>(null)
  const [pipelineAuthRequired, setPipelineAuthRequired] = useState(false)
  const [calculationInputKey, setCalculationInputKey] = useState<string | null>(null)
  const [entered, setEntered] = useState<boolean>(readInitialEntered)

  // True while the persistence layer replays a saved journey, so the reveal
  // scrolls below don't yank the page during restore/popstate.
  const restoringRef = useRef(hasPendingRestore())
  const pendingResultReveal = useRef(false)

  useEffect(() => {
    try { localStorage.setItem(ENTERED_KEY, entered ? '1' : '0') } catch { /* storage may be unavailable */ }
  }, [entered])

  useEffect(() => {
    const restoreProduct = () => {
      const saved = readProductDraft<{ intent: EntryIntent; analysis: ProductAnalysisV2 }>('analysis')
      if (saved?.intent === intent && saved.analysis?.product && saved.analysis?.customs) {
        setAnalysis(saved.analysis)
        // Bring back a finished quote when the saved inputs still match what the
        // replayed answers produced; otherwise fall back to the review step.
        const pipe = readProductDraft<PipelineDraft>('pipeline')
        if (hasConfirmedClassification(saved.analysis.customs) && pipe?.status === 'ready' && pipe.calculationInputKey === currentCalculationInputKeyRef.current) {
          setApprovedQuantity(pipe.approvedQuantity ?? null)
          setPipelineSummary(pipe.pipelineSummary)
          setPipelineStage(pipe.pipelineStage ?? 3)
          setCalculationInputKey(pipe.calculationInputKey)
          setCalculationStatus('ready')
          setStep(4)
        } else {
          setCalculationStatus('confirm')
        }
        setEntered(true)
      }
      restoringRef.current = false
    }
    window.addEventListener('shippingapp:journey-restored', restoreProduct)
    return () => window.removeEventListener('shippingapp:journey-restored', restoreProduct)
  }, [intent])

  // When auth resolves (modal sign-in completes), auto-retry any pending confirmation that was
  // interrupted by the auth gate — saves the user from clicking "Confirmar" a second time.
  const confirmAndCalculateRef = useRef<((data: ProductConfirmationData) => Promise<void>) | null>(null)
  const confirmationBusy = useRef(false)
  useEffect(() => {
    const onAuthResolved = () => {
      if (!analysis || confirmationBusy.current) return
      const operation = readOperation<ProductConfirmationData>('confirmation')
      if (operation && !canResume(operation)) return
      const pending = loadPendingConfirm()
      const data = operation?.payload ?? pending
      if (!data || !confirmAndCalculateRef.current) return
      void confirmAndCalculateRef.current(data)
    }
    window.addEventListener('shippingapp:auth-resolved', onAuthResolved)
    const checkReady = () => { if (getSessionState() === 'ready') onAuthResolved() }
    const unsubscribe = subscribeSession(checkReady)
    checkReady()
    return () => { unsubscribe(); window.removeEventListener('shippingapp:auth-resolved', onAuthResolved) }
  }, [analysis])

  // Clear the restore guard even if no journey-restored event ever arrives.
  useEffect(() => {
    if (!restoringRef.current) return
    const timer = window.setTimeout(() => { restoringRef.current = false }, 1200)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (analysis && intent) writeProductDraft('analysis', { intent, analysis })
  }, [analysis, intent])

  useEffect(() => {
    if (calculationStatus === 'ready' && pipelineSummary && calculationInputKey) {
      writeProductDraft('pipeline', { status: 'ready', pipelineSummary, pipelineStage, calculationInputKey, approvedQuantity } satisfies PipelineDraft)
    }
  }, [calculationStatus, pipelineSummary, pipelineStage, calculationInputKey, approvedQuantity])

  const operationAnswered = purpose !== null && entityType !== null && signature !== null
  const profileStep = purpose === null ? 1 : entityType === null ? 2 : signature === null ? 3 : 4
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

  const effectiveCalculationStatus: CalculationPipelineStatus = analysis && calculationStatus === 'ready' && !hasConfirmedClassification(analysis.customs)
    ? 'confirm'
    : calculationInputKey && calculationInputKey !== currentCalculationInputKey
    ? 'confirm'
    : calculationStatus

  const chatbotProduct = !!analysis && analysis.sourceUrl === 'chatbot://product'

  const analysisPrefill = useMemo<QuotePrefill | null>(() => {
    if (!analysis) return null
    return makeAnalysisPrefill(analysis, budgetMode, budgetUsd, sensitiveCategory)
  }, [analysis, budgetMode, budgetUsd, sensitiveCategory])

  const quoteSetup = useMemo<JourneyQuoteSetup>(() => ({
    budgetUsd: budgetMode === 'budget' ? budgetUsd : 0,
    quantity: budgetMode === 'units' && unitsMin === unitsMax ? unitsMin : undefined,
    purpose: purpose || 'unknown',
    entityType: entityType || 'unknown',
    hasImporterSignature: signature || 'unknown',
    sensitiveCategory: sensitiveCategory || 'unknown',
  }), [budgetMode, budgetUsd, unitsMin, unitsMax, purpose, entityType, signature, sensitiveCategory])

  const capacity: PurchaseCapacity = { mode: budgetMode || 'unknown', budgetUsd: budgetMode === 'budget' ? budgetUsd : 0, min: unitsMin, max: unitsMax }
  const resultPlan = analysis && analysisPrefill && hasConfirmedClassification(analysis.customs) && analysis.product.supplierQuote ? buildPurchasePlan({
    costs: { originCountry: analysisPrefill.originCountry, unitWeightKg: analysisPrefill.unitWeightKg, unitVolumeCbm: analysisPrefill.unitVolumeCbm, dutyRatePct: analysis.customs.dutyRatePct!, statisticsRatePct: analysisPrefill.statisticsRatePct ?? undefined, vatRatePct: analysisPrefill.vatRatePct ?? undefined, vatAdditionalRatePct: analysisPrefill.vatAdditionalRatePct ?? undefined, gainsRatePct: analysisPrefill.gainsRatePct ?? undefined, iibbRatePct: analysisPrefill.iibbRatePct ?? undefined, purpose: purpose || 'unknown', entityType: entityType || 'unknown', hasImporterSignature: signature === 'yes' ? true : signature === 'no' ? false : null, sensitiveCategory: sensitiveCategory || 'unknown', capitalGoodEligible: analysis.customs.capitalGoodEligible || false, capitalGoodUse: false },
    quote: analysis.product.supplierQuote, moq: analysis.product.moq || 0, capacity, quantity: capacity.mode === 'units' && approvedQuantity !== analysis.product.purchaseQuantity && ((analysis.product.purchaseQuantity || 0) < capacity.min || (analysis.product.purchaseQuantity || 0) > capacity.max) ? undefined : analysis.product.purchaseQuantity, quantityApproved: approvedQuantity === analysis.product.purchaseQuantity,
  }) : null

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ input: Record<string,unknown>; result: PurchaseQuoteSnapshot }>).detail
      const saved = detail?.result; const input = detail?.input
      if (!input || saved?.version !== 1 || !saved.analysis?.product || !saved.analysis?.customs || !saved.pipelineSummary || !saved.purchasePlan || !Array.isArray(saved.conversation)) return
      if (!['have_product','search_product','discover'].includes(String(input.intent)) || !['budget','units','unknown'].includes(String(input.budgetMode))) return
      const active = readOperation('confirmation'); if (active) settleOperation('confirmation', { ...active, status: 'failed' })
      const nextPurpose = input.purpose as ImportPurpose
      const nextEntity = input.entityType as ImportEntityType
      const nextSignature = input.signature as SignatureAnswer
      const nextCategory = input.sensitiveCategory as SensitiveProductCategory
      const nextMode = input.budgetMode as BudgetMode
      const nextBudget = Number(input.budgetUsd) || 0, nextMin = Number(input.unitsMin) || 1, nextMax = Number(input.unitsMax) || 1
      setIntent(input.intent as EntryIntent); setPurpose(nextPurpose); setEntityType(nextEntity); setSignature(nextSignature); setSensitiveCategory(nextCategory)
      setBudgetMode(nextMode); setBudgetUsd(nextBudget); setUnitsMin(nextMin); setUnitsMax(nextMax)
      setApprovedQuantity(Number(input.approvedQuantity) || null)
      writeCaseConversation(saved.analysis.sourceUrl, saved.conversation)
      setAnalysis(saved.analysis); setFrozenQuote(saved); setPipelineSummary(saved.pipelineSummary as CalculationPipelineSummary); setPipelineStage(3)
      setCalculationInputKey(JSON.stringify([nextPurpose,nextEntity,nextSignature,nextCategory,nextMode,nextBudget,nextMin,nextMax]))
      setPipelineBlocker(null); setPipelineAuthRequired(false); setCalculationStatus('ready'); setStep(4); setEntered(true); setShowSetup(false)
      pendingResultReveal.current = true
    }
    window.addEventListener('shippingapp:open-quote', open)
    return () => window.removeEventListener('shippingapp:open-quote', open)
  }, [])

  const progressStep = effectiveCalculationStatus === 'ready' ? 4 : step

  // Reveal a freshly shown card, but never during a persistence replay.
  const revealSection = (target: Element | null | undefined) => {
    if (restoringRef.current) return
    scrollIntoViewIfNeeded(target)
  }

  // The result exists only after React commits the ready state. Querying it
  // inside confirmAndCalculate reads the previous DOM and cannot reveal it.
  useEffect(() => {
    if (effectiveCalculationStatus !== 'ready' || restoringRef.current || !pendingResultReveal.current) return
    pendingResultReveal.current = false
    scrollIntoViewIfNeeded(document.querySelector('#calculator .result-hero'))
  }, [effectiveCalculationStatus])

  const enterApp = () => {
    setEntered(true)
    // Instant top — the landing→app switch must not smooth-scroll (the "salto").
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const resetPipeline = () => {
    setFrozenQuote(null)
    setApprovedQuantity(null)
    setShowSetup(false)
    setPipelineAuthRequired(false)
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
    setAnalysis({ ...next, product: { ...next.product, purchaseQuantity: quoteSetup.quantity }, suggestedQuantities: quoteSetup.quantity ? [quoteSetup.quantity] : next.suggestedQuantities })
    resetPipeline()
    setStep(3)
    revealSection(document.getElementById('case-confirmation'))
  }

  const handleManualFallback = (sourceUrl?: string) => {
    const pending = readOperation('search')
    if (pending) settleOperation('search', { ...pending, status: 'failed' })
    handleAnalysis(createManualProductAnalysis(sourceUrl || 'manual://product'))
  }

  const handleOwnedProductLink = async (url: string, signal?: AbortSignal) => {
    const operationId = readOperation('owned-link')?.id
    const next = await ingestAlibabaUrlV2(url, signal)
    if (signal?.aborted) return
    if (operationId && !operationIsCurrent('owned-link', operationId)) return
    handleAnalysis(next)
  }

  const handleOwnedProductDescription = (description: string) => {
    handleAnalysis(createManualProductAnalysis('manual://product', description))
  }

  const handleManualProductData = (data: ManualProductChatData) => {
    setSensitiveCategory(data.sensitiveCategory)
    handleAnalysis(createPrefilledAnalysis(data))
  }

  const editSelectedProduct = () => {
    clearProductDraft()
    resetPipeline()
    setStep(3)
    setAnalysis(null)
    if (intent === 'have_product') {
      revealSection(document.querySelector('.owned-product-intake'))
      return
    }
    revealSection(document.querySelector('.journey-product-surface'))
  }

  const reviewProductData = () => {
    writeProductDraft('quote-result', null)
    writeProductDraft('pending-quote-save', null)
    setFrozenQuote(null)
    setCalculationStatus('confirm')
    setPipelineStage(0)
    setPipelineSummary(null)
    setPipelineBlocker(null)
    setCalculationInputKey(null)
    revealSection(document.getElementById('case-confirmation'))
  }

  const confirmAndCalculate = async (confirmedProduct: ProductConfirmationData, approved = false) => {
    if (!analysis || confirmationBusy.current) return
    setPipelineAuthRequired(false)

    const classificationMissing = missingClassificationConfirmationFields(confirmedProduct)
    if (classificationMissing.length > 0) {
      setPipelineBlocker(`Todavía no puedo identificar el producto con seguridad: ${classificationMissing.map((item) => item.label).join(', ')}.`)
      setCalculationStatus('blocked')
      setPipelineStage(0)
      return
    }

    // Persist confirmation data so auth-resolved can auto-retry if the API gate interrupts this call.
    savePendingConfirm(confirmedProduct)
    const operation = beginOperation('confirmation', confirmedProduct)
    confirmationBusy.current = true

    const runInputKey = currentCalculationInputKey
    const confirmedAnalysis = applyProductConfirmation(analysis, confirmedProduct)
    setAnalysis(confirmedAnalysis)
    setCalculationInputKey(runInputKey)
    setCalculationStatus('processing')
    setPipelineStage(0)
    setPipelineSummary(null)
    setPipelineBlocker(null)

    try {
      const manualSelection = confirmedAnalysis.customs.source.includes('selección confirmada por el usuario')
      const refreshed = manualSelection && !confirmedAnalysis.usageReservationId && !confirmedAnalysis.fx
        ? { ...await startImportAnalysis(confirmedAnalysis, operation.id), customs: confirmedAnalysis.customs }
        : hasUsableClassification(confirmedAnalysis) && confirmedAnalysis.customs.missingFacts.length === 0
          ? confirmedAnalysis
          : await enrichProductAnalysisV2(confirmedAnalysis, operation.id)
      if (!operationIsCurrent('confirmation', operation.id)) return
      setAnalysis(refreshed)
      clearPendingConfirm()

      const confirmedClassification = hasConfirmedClassification(refreshed.customs)
      const duty = effectiveDutyRatePct(refreshed.customs)
      const effectiveTariff = effectiveTariffProfile(refreshed.customs)

      // Unverified candidate tariffs cannot feed a customer quotation.
      if (!confirmedClassification) {
        setPipelineStage(0)
        const noCandidate = !refreshed.customs.ncmCandidate || refreshed.customs.classificationConfidence === 'missing'
        setPipelineBlocker(noCandidate
          ? 'No pude cerrar una NCM con la identidad disponible. Elegí la descripción que más se parezca a tu producto o sumá un detalle técnico que distinga la posición.'
          : 'La clasificación no tiene evidencia suficiente. Completá la función o el material, o buscá y validá una posición en el nomenclador.')
        setCalculationStatus('blocked')
        return
      }

      await nextPaint()
      setPipelineStage(1)

      if (duty === null) {
        setPipelineBlocker('La NCM no tiene un derecho utilizable (confirmado ni estimado) en el motor. GlobalShipping detiene la cotización antes de inventar un arancel.')
        setCalculationStatus('blocked')
        return
      }

      const quoteMissing = missingQuoteConfirmationFields(productConfirmationFromAnalysis(refreshed))
      if (quoteMissing.length > 0) {
        setPipelineStage(2)
        const classificationNote = confirmedClassification
          ? 'La NCM ya quedó resuelta.'
          : 'Apliqué un arancel estimado (verificá la posición antes de operar).'
        setPipelineBlocker(`${classificationNote} Para cotizar sólo falta: ${quoteMissing.map((item) => item.label).join(', ')}.`)
        setCalculationStatus('blocked')
        return
      }

      const prefill = makeAnalysisPrefill(refreshed, budgetMode, budgetUsd, sensitiveCategory)
      await nextPaint()
      setPipelineStage(2)

      const priceEvidence = refreshed.product.supplierQuote
      if (!priceEvidence || supplierQuotePrice(priceEvidence, confirmedProduct.quantity) === null) {
        setPipelineBlocker('Revisá moneda, unidad o lote, variante y tramo del precio antes de cotizar.')
        setCalculationStatus('blocked')
        return
      }
      const costs = {
        originCountry: prefill.originCountry,
        unitWeightKg: prefill.unitWeightKg,
        unitVolumeCbm: prefill.unitVolumeCbm,
        dutyRatePct: duty,
        statisticsRatePct: effectiveTariff?.tePct ?? refreshed.customs.statisticsRatePct,
        vatRatePct: effectiveTariff?.vatPct ?? refreshed.customs.vatRatePct,
        vatAdditionalRatePct: effectiveTariff?.vatAdditionalPct ?? refreshed.customs.vatAdditionalRatePct,
        gainsRatePct: effectiveTariff?.gainsPct ?? refreshed.customs.gainsRatePct,
        iibbRatePct: effectiveTariff?.iibbPct ?? refreshed.customs.iibbRatePct,
        purpose: purpose || 'unknown',
        entityType: entityType || 'unknown',
        hasImporterSignature: signature === null || signature === 'unknown' ? null : signature === 'yes',
        sensitiveCategory: sensitiveCategory || 'unknown',
        capitalGoodEligible: effectiveTariff?.capitalGoodEligible ?? refreshed.customs.capitalGoodEligible ?? false,
        capitalGoodUse: false,
      }
      const plan = buildPurchasePlan({ costs, quote: priceEvidence, moq: confirmedProduct.moq, capacity, quantity: capacity.mode === 'budget' && !approved && approvedQuantity !== confirmedProduct.quantity ? undefined : capacity.mode === 'units' && !approved && approvedQuantity !== confirmedProduct.quantity && ((confirmedProduct.quantity || 0) < capacity.min || (confirmedProduct.quantity || 0) > capacity.max) ? undefined : confirmedProduct.quantity, quantityApproved: approved || approvedQuantity === confirmedProduct.quantity })
      if (!plan.selected) {
        setPipelineBlocker(plan.error || 'No hay una compra viable con estos datos.')
        setCalculationStatus('blocked')
        return
      }
      const baseQuantity = plan.selected.quantity
      const comparison = compareLandedCost({ ...costs, quantity: baseQuantity, unitPriceUsd: plan.selected.priceUsd })
      const quotedAnalysis = { ...refreshed, product: { ...refreshed.product, purchaseQuantity: baseQuantity, unitPriceUsd: plan.selected.priceUsd } }
      setAnalysis(quotedAnalysis)

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

      await nextPaint(120)
      clearPendingConfirm()
      pendingResultReveal.current = true
      setCalculationStatus('ready')
      setStep(4)
    } catch (error) {
      if (!operationIsCurrent('confirmation', operation.id)) return
      const message = error instanceof Error ? error.message : 'El pipeline no pudo completar el cálculo.'
      operation.status = error instanceof ApiAuthError ? 'waiting_auth' : 'failed'
      setPipelineAuthRequired(error instanceof ApiAuthError)
      if (!(error instanceof ApiAuthError)) clearPendingConfirm()
      setPipelineBlocker(message)
      setCalculationStatus('blocked')
    } finally {
      if (operation.status === 'running') operation.status = 'complete'
      settleOperation('confirmation', operation)
      confirmationBusy.current = false
    }
  }
  confirmAndCalculateRef.current = confirmAndCalculate

  const continueOperation = () => {
    if (operationAnswered) setStep(2)
  }

  const continueBudget = () => {
    if (!budgetAnswered) return
    setStep(3)
  }

  const resetJourney = () => {
    clearProductDraft()
    clearPendingConfirm()
    resetDialog.current?.close()
    window.dispatchEvent(new Event('shippingapp:journey-reset'))
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

  const requestReset = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (intent && event.isTrusted) resetDialog.current?.showModal()
    else resetJourney()
  }

  const productStatusLabel = analysis
    ? effectiveCalculationStatus === 'ready' ? 'Calculado' : effectiveCalculationStatus === 'processing' ? 'Procesando' : effectiveCalculationStatus === 'blocked' ? 'Falta una respuesta' : 'Listo para revisar'
    : step >= 3 ? 'Elegí o cargá un producto' : 'Todavía no elegido'

  if (!entered) return <Landing onStart={enterApp} />

  return <main className="journey-app" id="home">
    <a className="skip-to-quote" href="#cotizador">Ir al cotizador</a>
    <dialog ref={resetDialog} className="journey-reset-dialog" aria-labelledby="reset-title" aria-describedby="reset-description">
      <h2 id="reset-title">¿Empezar un caso nuevo?</h2>
      <p id="reset-description">Se quitarán los datos de este caso. Tus análisis guardados no se borran.</p>
      <div className="journey-dialog-actions">
        <button type="button" autoFocus onClick={() => resetDialog.current?.close()}>Seguir con este caso</button>
        <button type="button" className="journey-destructive-action" onClick={resetJourney}>Empezar de nuevo</button>
      </div>
    </dialog>
    <AppHeader onNewCase={requestReset} hasProduct={!!analysis} />

    <section className="journey-hero" id="cotizador" tabIndex={-1}>
      <h1 className="journey-task-title">{progressStep === 4 ? 'Cotización lista' : 'Tu cotización'}</h1>
      <div className="journey-progress-bar" role="progressbar" aria-valuenow={progressStep} aria-valuemin={0} aria-valuemax={4} aria-label={progressStep === 4 ? 'Cotización lista' : `Paso ${progressStep + 1} de 4: ${stepLabels[progressStep]}`}>
        <div className="journey-progress-track">
          <div className="journey-progress-fill" style={{ width: `${(progressStep / 4) * 100}%` }} />
        </div>
        <span className="journey-progress-label">{progressStep === 4 ? <><UiIcon name="check" size={14} />{' '}¡Listo!</> : `Paso ${progressStep + 1} de 4 · ${stepLabels[progressStep]}`}</span>
      </div>
    </section>

    <section className="journey-workspace" hidden={!!analysis && !showSetup}>
      <div className="journey-conversation">
        <div className="gs-chat-panel-header">
          <span className="gs-chat-panel-title">GLOBALSHIPPING</span>
          <span className="gs-chat-panel-status">
            <span className="gs-chat-panel-dot" aria-hidden="true" />
            {effectiveCalculationStatus === 'processing' ? 'CALCULANDO' : effectiveCalculationStatus === 'ready' ? 'LISTO' : 'EN LÍNEA'}
          </span>
        </div>
        <div className="gs-chat-body">
        <div className="journey-bubble assistant">
          <span className="journey-avatar" aria-hidden="true"><UiIcon name="sparkles" size={18} /></span>
          <div><b>Primero: ¿desde dónde arrancamos?</b><p>Del link del proveedor al costo unitario puesto en Argentina. GlobalShipping clasifica el NCM, carga aranceles e impuestos, compara LCL vs. a&#xE9;reo y te da la mejor alternativa para tu importaci&#xF3;n.</p></div>
        </div>

        {intent === null ? <div className="journey-choice-grid three">
          <button type="button" onClick={() => chooseIntent('have_product')}><span><UiIcon name="product" size={20} /></span><b>Ya tengo un producto</b><small>Tengo una publicación, proveedor o sé qué quiero traer.</small></button>
          <button type="button" onClick={() => chooseIntent('search_product')}><span><UiIcon name="search" size={20} /></span><b>Quiero buscarlo</b><small>Describilo en lenguaje natural y GlobalShipping busca opciones reales en Alibaba.</small></button>
          <button type="button" onClick={() => chooseIntent('discover')}><span><UiIcon name="sparkles" size={20} /></span><b>Quiero explorar</b><small>Buscá ideas de producto usando la misma búsqueda real, sin catálogo cacheado.</small></button>
        </div> : <div className="journey-bubble user"><div><b>{intent === 'have_product' ? 'Ya tengo el producto.' : intent === 'search_product' ? 'Quiero buscar un producto.' : 'Quiero explorar productos.'}</b><button type="button" onClick={requestReset}>Cambiar</button></div></div>}

        {intent && <>
          <div className="journey-bubble assistant">
            <span className="journey-avatar" aria-hidden="true"><UiIcon name="sparkles" size={18} /></span>
            <div><b>Contame cómo vas a importar.</b><p>Estas respuestas afectan impuestos, gastos y trámites. Si no sabés algo, podés marcar “No sé”.</p></div>
          </div>

          <section className={`journey-question-card${step === 1 ? ' active' : ''}`}>
            <div className="journey-question-head"><span>01</span><div><b>Tu operación</b><small>Afecta impuestos y trámites.</small></div>{step > 1 && <button type="button" onClick={() => setStep(1)}>Editar</button>}</div>
            {step === 1 ? <div className="journey-question-fields">
              <div><label>¿Para qué lo traés?</label><div className="journey-chip-row"><button className={purpose === 'resale' ? 'selected' : ''} onClick={() => setPurpose('resale')} type="button">Reventa</button><button className={purpose === 'own_use' ? 'selected' : ''} onClick={() => setPurpose('own_use')} type="button">Uso propio</button><button className={purpose === 'unknown' ? 'selected' : ''} onClick={() => setPurpose('unknown')} type="button">No sé</button></div></div>
              {profileStep >= 2 && <div><label>¿Quién importa?</label><div className="journey-chip-row"><button className={entityType === 'company' ? 'selected' : ''} onClick={() => setEntityType('company')} type="button">Empresa</button><button className={entityType === 'individual' ? 'selected' : ''} onClick={() => setEntityType('individual')} type="button">Persona</button><button className={entityType === 'unknown' ? 'selected' : ''} onClick={() => setEntityType('unknown')} type="button">No sé</button></div></div>}
              {profileStep >= 3 && <div><label>¿Tenés firma/importador para operar?</label><div className="journey-chip-row"><button className={signature === 'yes' ? 'selected' : ''} onClick={() => setSignature('yes')} type="button">Sí</button><button className={signature === 'no' ? 'selected' : ''} onClick={() => setSignature('no')} type="button">No</button><button className={signature === 'unknown' ? 'selected' : ''} onClick={() => setSignature('unknown')} type="button">No sé</button></div></div>}
              <button className="journey-primary-action" type="button" disabled={!operationAnswered} onClick={continueOperation}>Seguir con presupuesto <span><UiIcon name="arrow-right" size={18} /></span></button>
            </div> : <div className="journey-complete-row"><span>{purposeLabel(purpose)}</span><span>{entityLabel(entityType)}</span><span>{signatureLabel(signature)}</span></div>}
          </section>

          {step >= 2 && <>
            <div className="journey-bubble assistant">
              <span className="journey-avatar" aria-hidden="true"><UiIcon name="sparkles" size={18} /></span>
              <div><b>¿Cuánto querés invertir?</b><p>Presupuesto total, rango de unidades, o dejalo en abierto por ahora.</p></div>
            </div>
            <section className={`journey-question-card${step === 2 ? ' active' : ''}`}>
              <div className="journey-question-head"><span>02</span><div><b>Presupuesto o rango</b><small>Esto limita las cantidades que vale la pena simular.</small></div>{step > 2 && <button type="button" onClick={() => setStep(2)}>Editar</button>}</div>
              {step === 2 ? <div className="journey-question-fields">
                <div className="journey-choice-grid budget">
                  <button className={budgetMode === 'budget' ? 'selected' : ''} type="button" onClick={() => { setApprovedQuantity(null); setBudgetMode('budget') }}><b>Tengo presupuesto</b><small>Quiero maximizar lo que puedo traer sin pasarme.</small></button>
                  <button className={budgetMode === 'units' ? 'selected' : ''} type="button" onClick={() => { setApprovedQuantity(null); setBudgetMode('units') }}><b>Tengo rango de unidades</b><small>Sé más o menos cuántas quiero probar.</small></button>
                  <button className={budgetMode === 'unknown' ? 'selected' : ''} type="button" onClick={() => { setApprovedQuantity(null); setBudgetMode('unknown') }}><b>Todavía no sé</b><small>Quiero entender primero el orden de magnitud.</small></button>
                </div>
                {budgetMode === 'budget' && <label className="journey-number-field"><span>Presupuesto máximo total</span><div><small>USD</small><input type="number" step="500" value={budgetUsd || ''} aria-invalid={!!budgetError} aria-describedby={budgetError ? 'journey-budget-error' : undefined} onFocus={(e) => e.target.select()} onChange={(event) => { setApprovedQuantity(null); const v = event.target.valueAsNumber; setBudgetUsd(Number.isFinite(v) && v >= 0 ? v : 0) }} /></div><em>Incluye compra, flete e impuestos estimados.</em></label>}
                {budgetMode === 'units' && <div className="journey-range-fields"><label><span>Mínimo de unidades</span><input type="number" step="1" value={unitsMin || ''} aria-invalid={!!budgetError} aria-describedby={budgetError ? 'journey-budget-error' : undefined} onFocus={(e) => e.target.select()} onChange={(event) => { setApprovedQuantity(null); const v = event.target.valueAsNumber; setUnitsMin(Number.isFinite(v) && v >= 0 ? v : 0) }} /></label><label><span>Máximo de unidades</span><input type="number" step="1" value={unitsMax || ''} aria-invalid={!!budgetError} aria-describedby={budgetError ? 'journey-budget-error' : undefined} onFocus={(e) => e.target.select()} onChange={(event) => { setApprovedQuantity(null); const v = event.target.valueAsNumber; setUnitsMax(Number.isFinite(v) && v >= 0 ? v : 0) }} /></label></div>}
                {budgetError && <div className="pipeline-warning" id="journey-budget-error" role="alert"><b>Revisá presupuesto o rango.</b><span>{budgetError}</span></div>}
                <button className="journey-primary-action" type="button" disabled={!budgetAnswered} onClick={continueBudget}>Seguir con el producto <span><UiIcon name="arrow-right" size={18} /></span></button>
              </div> : <div className="journey-complete-row"><span>{budgetMode === 'budget' ? `Hasta USD ${budgetUsd.toLocaleString('es-AR')}` : budgetMode === 'units' ? `${unitsMin}–${unitsMax} unidades` : 'Todavía sin cantidad definida'}</span>{analysis?.product.purchaseQuantity && budgetMode !== 'unknown' ? <span>{analysis.product.purchaseQuantity} unidades seleccionadas</span> : null}</div>}
            </section>
          </>}

          {step >= 3 && <>
            {!(intent === 'have_product' && analysis) && <div className="journey-bubble assistant">
              <span className="journey-avatar" aria-hidden="true"><UiIcon name="sparkles" size={18} /></span>
              <div>
                <b>{intent === 'have_product' ? '¿Tenés el link o preferís contarme qué producto es?' : '¿Qué producto querés buscar?'}</b>
                <p>{intent === 'have_product'
                  ? 'Pegá el link de Alibaba o describí el producto. Después confirmamos sólo la información que realmente haga falta.'
                  : 'Escribí producto + material/uso y, si querés, precio máximo o MOQ. También podés pegar directamente un link de Alibaba.'}</p>
              </div>
            </div>}

            {intent === 'have_product' && !analysis && <div className="journey-product-surface"><OwnedProductIntake onAlibabaLink={handleOwnedProductLink} onStructuredData={handleManualProductData} /></div>}

            {/* Product receipt: once analysis is set, show a read-only summary of
                what the chatbot collected so the user isn't left in the dark. */}
            {intent === 'have_product' && analysis && chatbotProduct && (
              <div className="journey-product-surface">
                <div className="pipeline-understood-card">
                  <span className="eyebrow">Producto cargado</span>
                  <p className="pipeline-understood-sentence"><b>{analysis.product.name}</b></p>
                  <div className="chatbot-receipt-bar">
                    {analysis.product.unitPriceUsd ? (
                      <span className="chatbot-receipt-chip">
                        <span className="chatbot-receipt-chip-label">Precio FOB</span>
                        <span className="chatbot-receipt-chip-value">USD {analysis.product.unitPriceUsd.toLocaleString('es-AR')}</span>
                      </span>
                    ) : null}
                    {analysis.product.originCountry ? (
                      <span className="chatbot-receipt-chip">
                        <span className="chatbot-receipt-chip-label">Origen</span>
                        <span className="chatbot-receipt-chip-value">{analysis.product.originCountry}</span>
                      </span>
                    ) : null}
                    {analysis.product.packedWeightKg ? (
                      <span className="chatbot-receipt-chip">
                        <span className="chatbot-receipt-chip-label">Peso</span>
                        <span className="chatbot-receipt-chip-value">{analysis.product.packedWeightKg} kg</span>
                      </span>
                    ) : null}
                    {analysis.product.moq ? (
                      <span className="chatbot-receipt-chip">
                        <span className="chatbot-receipt-chip-label">MOQ</span>
                        <span className="chatbot-receipt-chip-value">{analysis.product.moq} uds.</span>
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {(intent === 'search_product' || intent === 'discover') && <div className="journey-product-surface"><UrlAnalyzer deferCalculation mode={intent === 'discover' ? 'discovery' : 'intake'} onAnalysis={handleAnalysis} onManualFallback={handleManualFallback} analysis={analysis} /></div>}
          </>}
        </>}
        </div>{/* gs-chat-body */}
      </div>

      <aside className="journey-case-summary">
        <div className="journey-summary-sticky">
          <span className="eyebrow">Caso en construcción</span>
          <h2>{analysisPrefill?.productName || (intent === 'have_product' ? 'Tu producto' : 'Nueva importación')}</h2>
          {(() => {
            const label = analysisPrefill?.productName ? translateProductLabel(analysisPrefill.productName) : null
            return label?.fromEnglish && label.translated
              ? <p className="journey-summary-translation">En español: {label.text}</p>
              : null
          })()}
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

    {analysis && <div className="simple-quote"><button type="button" className="pipeline-secondary" onClick={() => { setShowSetup(value => !value); reviewProductData() }}>{showSetup ? 'Volver a la conversación' : 'Editar objetivo o perfil'}</button></div>}
    {analysis && analysisPrefill && <section className="journey-pipeline-section">
      <CalculationPipeline
        analysis={analysis}
        capacity={capacity}
        prefill={analysisPrefill}
        status={effectiveCalculationStatus}
        activeStage={pipelineStage}
        purchaseRange={budgetMode === 'units' ? { min: unitsMin, max: unitsMax } : undefined}
        costProfile={{ purpose: purpose || 'unknown', entityType: entityType || 'unknown', hasImporterSignature: signature === 'unknown' || signature === null ? null : signature === 'yes', sensitiveCategory: sensitiveCategory || 'unknown' }}
        summary={pipelineSummary}
        blocker={pipelineBlocker}
        authRequired={pipelineAuthRequired}
        onConfirm={(product) => void confirmAndCalculate(product)}
        onManualNcm={(customs, product) => {
          setAnalysis({ ...applyProductConfirmation(analysis, product), customs })
          reviewProductData()
        }}
        onEditProduct={editSelectedProduct}
        onReviewProduct={reviewProductData}
      />
    </section>}

    {analysis && analysisPrefill && resultPlan && pipelineSummary && effectiveCalculationStatus === 'ready' && <section className="journey-calculator-section" id="calculator">
      <PurchaseQuoteResult key={`${analysis.sourceUrl}:${pipelineSummary.baseQuantity}:${pipelineSummary.totalCostUsd}:${frozenQuote?.quotedAt || 'live'}`} analysis={analysis} plan={frozenQuote?.purchasePlan || resultPlan} capacity={capacity} summary={pipelineSummary} saved={frozenQuote} input={{ intent, purpose, entityType, signature, sensitiveCategory, budgetMode, budgetUsd, unitsMin, unitsMax, approvedQuantity, productName: analysis.product.name, sourceUrl: analysis.sourceUrl }} onEdit={reviewProductData} onChoose={quantity => {
        setApprovedQuantity(quantity); reviewProductData(); void confirmAndCalculate({ ...productConfirmationFromAnalysis(analysis), quantity }, true)
      }} />
    </section>}

    {!intent && <footer className="journey-footer">
      <div className="journey-footer-left">
        <a className="journey-footer-brand" href="#home"><span>GlobalShipping</span></a>
        <p className="journey-footer-copy">&#xA9; {new Date().getFullYear()} GlobalShipping. Calculadora de costos de importaci&#xF3;n.</p>
      </div>
      <nav className="journey-footer-links" aria-label="P&#xE1;ginas legales">
        <a href="/privacidad.html">Pol&#xED;tica de Privacidad</a>
        <a href="/terminos.html">T&#xE9;rminos de Uso</a>
      </nav>
    </footer>}
  </main>
}
