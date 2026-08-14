import { scenario } from './scenario'
import { missingAutomaticEvidence } from './decisionReadiness'
import { optimizeRobust, type RobustCandidate } from './robustOptimizer'
import type { ProductAnalysisV2 } from './productAnalysisV2'
import type { Inputs, Result, ScenarioTaxContext } from './types'

export type OpportunityVerdict = 'attractive' | 'borderline' | 'avoid' | 'incomplete'
export type OpportunityStage = 'instant_screening' | 'robust_decision'

export type OpportunityDecision = {
  verdict: OpportunityVerdict
  stage: OpportunityStage
  label: string
  summary: string
  evidenceConfidencePct: number
  provisional: boolean
  result: Result | null
  robustCandidate: RobustCandidate | null
  reasons: string[]
  warnings: string[]
  nextActions: string[]
}

type DecisionArgs = {
  analysis: ProductAnalysisV2 | null
  inputs: Inputs
  taxContext: ScenarioTaxContext
  economicsReady: boolean
  marketP25Ars?: number | null
  manualOverrideActive?: boolean
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
const pct = (value: number) => `${Math.round(value * 100)}%`
const usd = (value: number) => `USD ${Math.round(value).toLocaleString('en-US')}`

function evidenceConfidence(analysis: ProductAnalysisV2 | null) {
  if (!analysis) return 0
  const overall = clamp(analysis.confidence?.overall ?? 0)
  const marketDetails = (analysis.market as any)?.details
  const market = marketDetails?.status === 'live' && Number.isFinite(Number(marketDetails?.confidence))
    ? clamp(Number(marketDetails.confidence))
    : overall
  const customsPenalty = analysis.customs.classificationConfidence === 'high'
    ? 0
    : analysis.customs.classificationConfidence === 'medium'
      ? 8
      : analysis.customs.classificationConfidence === 'low'
        ? 25
        : 35
  return Math.round(clamp(Math.min(overall, market) - customsPenalty))
}

function cheapestMoqScenario(inputs: Inputs, context: ScenarioTaxContext, moq: number) {
  const candidates = [scenario(moq, 'air', inputs, context), scenario(moq, 'sea', inputs, context)]
  const affordable = candidates.filter((row) => row.affordable)
  const pool = affordable.length ? affordable : candidates
  return [...pool].sort((a, b) => a.economicLandedUnitUsd - b.economicLandedUnitUsd || a.cashRequiredUsd - b.cashRequiredUsd)[0]
}

function incompleteDecision(analysis: ProductAnalysisV2 | null, missing: string[]): OpportunityDecision {
  return {
    verdict: 'incomplete',
    stage: 'instant_screening',
    label: 'INCOMPLETE',
    summary: missing.length
      ? `Falta evidencia crítica: ${missing.join(', ')}.`
      : 'Todavía no hay evidencia suficiente para evaluar la oportunidad.',
    evidenceConfidencePct: evidenceConfidence(analysis),
    provisional: true,
    result: null,
    robustCandidate: null,
    reasons: [],
    warnings: ['ShippingAPP no completa estos campos con defaults de otro producto.'],
    nextActions: ['Completar o verificar la evidencia faltante y volver a calcular.'],
  }
}

function instantDecision(analysis: ProductAnalysisV2, inputs: Inputs, context: ScenarioTaxContext): OpportunityDecision {
  const activeQuantities = inputs.quantities.filter((q) => Number.isFinite(q) && q > 0)
  if (!activeQuantities.length) return incompleteDecision(analysis, ['cantidad / MOQ activo'])
  // The economic case may have been replaced by Expert Override. Use the active
  // scenario floor rather than silently reverting to the originally extracted MOQ.
  const moq = Math.min(...activeQuantities)
  const result = cheapestMoqScenario({ ...inputs, monthlyDemand: 0 }, context, moq)
  const margin = result.marginPct
  const hasCapital = inputs.capitalAvailableUsd > 0
  const shortfall = hasCapital ? Math.max(0, result.cashRequiredUsd - inputs.capitalAvailableUsd) : 0
  const capitalBlocked = hasCapital && shortfall > 0

  let verdict: OpportunityVerdict = 'borderline'
  if (capitalBlocked && shortfall > inputs.capitalAvailableUsd * 0.2) verdict = 'avoid'
  else if (margin < 0.15) verdict = 'avoid'
  else if (margin >= 0.30 && !capitalBlocked) verdict = 'attractive'

  const label = verdict === 'attractive'
    ? 'ATTRACTIVE · DEMAND PENDING'
    : verdict === 'avoid'
      ? capitalBlocked ? 'AVOID · CURRENT CAPITAL' : 'AVOID · WEAK UNIT ECONOMICS'
      : capitalBlocked ? 'BORDERLINE · CAPITAL GAP' : 'BORDERLINE · DEMAND PENDING'

  const reasons = [
    `MOQ económico activo ${moq} u. · ${result.mode === 'air' ? 'aéreo' : 'marítimo'} · costo económico ${usd(result.economicLandedUnitUsd)}/u.`,
    `Margen bruto de screening ${pct(margin)} al precio local observado.`,
    `Cash inicial estimado ${usd(result.cashRequiredUsd)}.`,
  ]
  if (capitalBlocked) reasons.push(`El capital informado queda corto por ${usd(shortfall)}.`)

  const warnings = [
    'Este verdict todavía no usa velocidad de venta: una buena diferencia de precio no demuestra demanda.',
    ...(hasCapital ? [] : ['Capital no informado: el screening no evalúa si el MOQ es financiable para este usuario.']),
    'Arancel, NCM/SIM e intervenciones siguen siendo screening hasta validación aplicable.',
  ]

  return {
    verdict,
    stage: 'instant_screening',
    label,
    summary: verdict === 'attractive'
      ? 'Los unit economics del MOQ justifican seguir investigando; falta demostrar velocidad de venta.'
      : verdict === 'avoid'
        ? capitalBlocked ? 'El pedido mínimo no entra razonablemente en el capital informado.' : 'El margen de screening es demasiado débil para compensar la incertidumbre de importación.'
        : 'La oportunidad no es descartable, pero todavía no tiene suficiente colchón para considerarla atractiva.',
    evidenceConfidencePct: evidenceConfidence(analysis),
    provisional: true,
    result,
    robustCandidate: null,
    reasons,
    warnings,
    nextActions: [
      'Ingresar una hipótesis de demanda mensual para pasar al Robust Decision.',
      ...(hasCapital ? [] : ['Opcional: informar capital disponible para evaluar factibilidad financiera.']),
    ],
  }
}

function robustDecision(analysis: ProductAnalysisV2, inputs: Inputs, context: ScenarioTaxContext, marketP25Ars?: number | null): OpportunityDecision {
  const floor = marketP25Ars && marketP25Ars > 0 && marketP25Ars < inputs.marketPriceArs ? marketP25Ars : null
  const robust = optimizeRobust(inputs, context, { demandDownPct: 30, marketFloorArs: floor })
  const candidate = robust.robustRecommendation
  if (!candidate) return incompleteDecision(analysis, ['escenarios robustos'])

  const base = candidate.base
  const hasCapital = inputs.capitalAvailableUsd > 0
  const capitalBlocked = hasCapital && !candidate.affordable
  const fragile = candidate.scoreDrop >= 20
  const weakDownside = candidate.worstMarginPct < 0.15
  const excessiveInventory = candidate.worstInventoryMonths > 9

  let verdict: OpportunityVerdict
  if (capitalBlocked || candidate.worstMarginPct < 0 || candidate.robustScore < 40) verdict = 'avoid'
  else if (candidate.robustScore >= 65 && !weakDownside && !excessiveInventory && !fragile) verdict = 'attractive'
  else verdict = 'borderline'

  const reasons = [
    `Robust score ${candidate.robustScore}/100 (base ${candidate.baseScore}/100).`,
    `Peor margen del stress: ${pct(candidate.worstMarginPct)}.`,
    `Peor inventario estimado: ${candidate.worstInventoryMonths.toFixed(1)} meses.`,
    `Cantidad robusta: ${candidate.quantity} u. por ${candidate.mode === 'air' ? 'aéreo' : 'marítimo'}.`,
    `Cash inicial base: ${usd(base.cashRequiredUsd)}.`,
  ]
  if (robust.selectionChanges && robust.baseRecommendation) reasons.push(`El stress cambia la recomendación base de ${robust.baseRecommendation.quantity} u./${robust.baseRecommendation.mode} a ${candidate.quantity} u./${candidate.mode}.`)

  const warnings: string[] = []
  if (fragile) warnings.push(`El score cae ${candidate.scoreDrop} puntos bajo stress: la oportunidad es sensible.`)
  if (weakDownside) warnings.push('El margen de downside queda por debajo del colchón de 15%.')
  if (excessiveInventory) warnings.push('El downside supera 9 meses de inventario.')
  if (capitalBlocked) warnings.push('Ningún escenario robusto entra en el capital informado.')
  if (!hasCapital) warnings.push('Capital no informado: el Robust Decision no evalúa factibilidad financiera ni affordability.')
  warnings.push('La demanda ingresada es una hipótesis del usuario, no ventas observadas por ShippingAPP.')

  const label = verdict === 'attractive'
    ? hasCapital ? 'ATTRACTIVE' : 'ATTRACTIVE · CAPITAL UNCHECKED'
    : verdict === 'avoid' ? 'AVOID' : hasCapital ? 'BORDERLINE' : 'BORDERLINE · CAPITAL UNCHECKED'

  return {
    verdict,
    stage: 'robust_decision',
    label,
    summary: verdict === 'attractive'
      ? hasCapital
        ? 'La oportunidad conserva margen, capital e inventario razonables bajo los stresses definidos.'
        : 'La oportunidad conserva margen e inventario razonables bajo stress; la factibilidad de capital todavía no fue evaluada.'
      : verdict === 'avoid'
        ? 'El caso no sobrevive una condición crítica de margen, capital o stress.'
        : 'El caso puede funcionar, pero el downside todavía es demasiado sensible para una señal fuerte.',
    evidenceConfidencePct: evidenceConfidence(analysis),
    provisional: false,
    result: base,
    robustCandidate: candidate,
    reasons,
    warnings,
    nextActions: verdict === 'attractive'
      ? [
          'Validar la demanda con evidencia comercial antes de comprar.',
          ...(hasCapital ? [] : ['Informar capital disponible si querés evaluar factibilidad financiera.']),
          'Confirmar aduana/flete vigentes antes de ejecutar la operación.',
        ]
      : ['Atacar primero el warning más material y volver a correr el caso.'],
  }
}

export function buildOpportunityDecision({ analysis, inputs, taxContext, economicsReady, marketP25Ars, manualOverrideActive = false }: DecisionArgs): OpportunityDecision {
  if (!analysis) return incompleteDecision(null, ['producto analizado'])
  if (!economicsReady) {
    const missing = manualOverrideActive ? ['USD/ARS BCRA'] : missingAutomaticEvidence(analysis)
    return incompleteDecision(analysis, missing)
  }
  if (!Number.isFinite(inputs.monthlyDemand) || inputs.monthlyDemand <= 0) return instantDecision(analysis, inputs, taxContext)
  return robustDecision(analysis, inputs, taxContext, marketP25Ars)
}
