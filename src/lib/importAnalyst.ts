import type { OpportunityDecision } from './opportunityDecision'
import type { ProductAnalysisV2 } from './productAnalysisV2'
import type { Inputs } from './types'

export type AnalystChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export type AnalystScenarioPatch = {
  monthlyDemand?: number
  capitalAvailableUsd?: number
}

export type AnalystReply = {
  answer: string
  scenarioPatch: AnalystScenarioPatch | null
  actionReason: string | null
}

export function buildAnalystContext(analysis: ProductAnalysisV2, inputs: Inputs, decision: OpportunityDecision) {
  const market = analysis.market as any
  const details = market.details || {}
  const result = decision.result
  const robust = decision.robustCandidate

  return {
    product: {
      name: analysis.product.name,
      category: analysis.product.category,
      unitPriceUsd: analysis.product.unitPriceUsd,
      moq: analysis.product.moq,
      packedWeightKg: analysis.product.packedWeightKg,
      volumeCbm: analysis.product.volumeCbm,
      originCountry: analysis.product.originCountry,
      sourceReadMode: (analysis as any).sourceRead?.mode || analysis.confidence.productSource,
    },
    market: {
      estimatedPriceArs: analysis.market.estimatedPriceArs,
      p25Ars: Number(details.p25Ars) || null,
      medianArs: Number(details.medianArs) || null,
      p75Ars: Number(details.p75Ars) || null,
      comparableCount: Number(details.comparableCount) || null,
      confidence: Number(details.confidence) || null,
      source: analysis.market.source,
    },
    fx: analysis.fx || null,
    customs: {
      ncmCandidate: analysis.customs.ncmCandidate,
      classificationConfidence: analysis.customs.classificationConfidence,
      dutyRatePct: analysis.customs.dutyRatePct,
      dutyRateStatus: analysis.customs.dutyRateStatus,
      interventionsStatus: analysis.customs.interventionsStatus,
      source: analysis.customs.source,
    },
    inputs: {
      monthlyDemand: inputs.monthlyDemand,
      capitalAvailableUsd: inputs.capitalAvailableUsd,
      marketPriceArs: inputs.marketPriceArs,
      usdArs: inputs.usdArs,
      airUsdKg: inputs.airUsdKg,
      seaUsdCbm: inputs.seaUsdCbm,
      fixedFeesUsd: inputs.fixedFeesUsd,
    },
    decision: {
      label: decision.label,
      stage: decision.stage,
      summary: decision.summary,
      evidenceConfidencePct: decision.evidenceConfidencePct,
      quantity: result?.quantity ?? null,
      mode: result?.mode ?? null,
      economicLandedUnitUsd: result?.economicLandedUnitUsd ?? null,
      cashRequiredUsd: result?.cashRequiredUsd ?? null,
      marginPct: result?.marginPct ?? null,
      breakEvenArs: result?.breakEvenArs ?? null,
      robustScore: robust?.robustScore ?? null,
      worstMarginPct: robust?.worstMarginPct ?? null,
      reasons: decision.reasons,
      warnings: decision.warnings,
      nextActions: decision.nextActions,
    },
  }
}

function numeric(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function sanitizePatch(value: unknown): AnalystScenarioPatch | null {
  if (!value || typeof value !== 'object') return null
  const patch: AnalystScenarioPatch = {}
  const demand = numeric((value as any).monthlyDemand)
  const capital = numeric((value as any).capitalAvailableUsd)

  if (demand !== null && demand >= 0 && demand <= 1_000_000) patch.monthlyDemand = Math.round(demand)
  if (capital !== null && capital >= 0 && capital <= 1_000_000_000) patch.capitalAvailableUsd = Math.round(capital * 100) / 100
  return Object.keys(patch).length ? patch : null
}

export async function askImportAnalyst(
  message: string,
  history: AnalystChatMessage[],
  analysis: ProductAnalysisV2,
  inputs: Inputs,
  decision: OpportunityDecision,
): Promise<AnalystReply> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message,
      history: history.slice(-8).map(({ role, content }) => ({ role, content })),
      context: buildAnalystContext(analysis, inputs, decision),
    }),
  })
  const data = await response.json() as AnalystReply & { error?: string }
  if (!response.ok) throw new Error(data.error || 'AI Import Analyst no disponible.')
  return {
    answer: typeof data.answer === 'string' && data.answer.trim() ? data.answer.trim() : 'No pude formular una respuesta confiable.',
    scenarioPatch: sanitizePatch(data.scenarioPatch),
    actionReason: typeof data.actionReason === 'string' && data.actionReason.trim() ? data.actionReason.trim() : null,
  }
}

export function applyAnalystScenario(inputs: Inputs, patch: AnalystScenarioPatch): Inputs {
  const safe = sanitizePatch(patch)
  if (!safe) return inputs
  return {
    ...inputs,
    ...(safe.monthlyDemand !== undefined ? { monthlyDemand: safe.monthlyDemand } : {}),
    ...(safe.capitalAvailableUsd !== undefined ? { capitalAvailableUsd: safe.capitalAvailableUsd } : {}),
  }
}
