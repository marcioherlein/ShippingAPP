import { analyzeAlibabaUrl, applyAnalysis, type ProductAnalysis } from './productAnalysis'
import { customsProfileFor, type CustomsProfile } from './customsClassification'
import { mergeFullCustomsProfile, type FullNcmFacts } from './fullNcmClient'
import { applyRemoteTariffEvidence } from './ncmTariffClient'
import {
  classifyNcmWithClarifications,
  clarificationFrom,
  type NcmClarification,
  type NcmClarificationAnswer,
  type NcmClarificationOption,
} from './ncmClarificationClient'
import type { Inputs } from './types'

export type ProductAnalysisV2 = ProductAnalysis & {
  customs: CustomsProfile
  ncmClarification: NcmClarification | null
  ncmClarificationAnswers: NcmClarificationAnswer[]
}

function fullFacts(base: ProductAnalysis): FullNcmFacts {
  return {
    name: base.product.name,
    category: base.product.category,
    material: base.product.material ?? null,
    functionText: base.product.functionText ?? null,
    description: base.product.description ?? null,
  }
}

function clarificationLock(customs: CustomsProfile, clarification: NcmClarification | null, exhausted: boolean): CustomsProfile {
  const blocker = clarification
    ? `Confirmar antes de usar aranceles: ${clarification.question}`
    : exhausted
      ? 'La NCM sigue con baja confianza después de las aclaraciones; requiere revisión antes de usar aranceles.'
      : 'La NCM todavía no tiene evidencia suficiente para usar aranceles.'
  return {
    ...customs,
    classificationConfidence: 'low',
    dutyRatePct: null,
    dutyRateStatus: 'missing',
    simOpeningCandidate: null,
    simOpeningConfidence: 'missing',
    simAlternatives: [],
    simSource: 'SIM pendiente hasta resolver la clasificación NCM.',
    missingFacts: [...new Set([...customs.missingFacts, blocker])],
    rationale: [...customs.rationale, 'Clarification gate activo: ShippingAPP no promueve una tarifa mientras la clasificación requiera confirmación del usuario.'],
  }
}

async function resolveCustoms(base: ProductAnalysis, answers: NcmClarificationAnswer[]) {
  const localCustoms = customsProfileFor(base.product.category, base.product.originCountry, base.product.name)
  const full = await classifyNcmWithClarifications(fullFacts(base), answers)
  const clarification = clarificationFrom(full)
  let customs = applyRemoteTariffEvidence(mergeFullCustomsProfile(localCustoms, full), full)
  const unresolved = full.confidence === 'low' || full.confidence === 'missing' || full.status === 'missing'
  if (clarification || unresolved) customs = clarificationLock(customs, clarification, answers.length >= 3)
  return { customs, clarification }
}

export async function enrichProductAnalysisV2(base: ProductAnalysis): Promise<ProductAnalysisV2> {
  const localCustoms = customsProfileFor(base.product.category, base.product.originCountry, base.product.name)
  let customs = localCustoms
  let ncmClarification: NcmClarification | null = null

  try {
    const resolved = await resolveCustoms(base, [])
    customs = resolved.customs
    ncmClarification = resolved.clarification
  } catch {
    customs = {
      ...localCustoms,
      source: `${localCustoms.source} Full-catalog retrieval no disponible; fallback seed fail-closed.`,
      rationale: [...localCustoms.rationale, 'No se pudo consultar la snapshot full-catalog; no se amplió ni inventó la clasificación.'],
    }
  }

  // Market evidence and customs evidence are independent. A missing/LOW duty
  // blocks landed-cost economics through decisionReadiness, but must not erase
  // a valid local-market observation that is still useful to the user.
  return { ...base, customs, ncmClarification, ncmClarificationAnswers: [] }
}

export async function reclassifyProductAnalysisV2(
  current: ProductAnalysisV2,
  option: NcmClarificationOption,
): Promise<ProductAnalysisV2> {
  const clarification = current.ncmClarification
  if (!clarification) return current
  if (current.ncmClarificationAnswers.length >= 3) return { ...current, ncmClarification: null }

  const answers: NcmClarificationAnswer[] = [
    ...current.ncmClarificationAnswers,
    { question: clarification.question, answer: option.value, factKey: clarification.factKey },
  ].slice(0, 3)

  const resolved = await resolveCustoms(current, answers)
  return {
    ...current,
    customs: resolved.customs,
    ncmClarification: resolved.clarification,
    ncmClarificationAnswers: answers,
  }
}

export async function analyzeAlibabaUrlV2(url: string): Promise<ProductAnalysisV2> {
  return enrichProductAnalysisV2(await analyzeAlibabaUrl(url))
}

export function applyAnalysisV2(current: Inputs, analysis: ProductAnalysisV2): Inputs {
  const base = applyAnalysis(current, analysis)
  return {
    ...base,
    // A new scan must replace the previous product's customs state. When the
    // classifier deliberately withholds duty (missing/LOW confidence), reset
    // the numeric field to a neutral sentinel instead of retaining stale duty.
    dutyRatePct: analysis.customs.dutyRatePct ?? 0,
    dutyRateVerified: false,
    statisticsRatePct: analysis.customs.statisticsRatePct,
  }
}
