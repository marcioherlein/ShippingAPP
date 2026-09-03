import { applyAnalysis, readAlibabaProduct, startImportAnalysis, type ProductAnalysis } from './productAnalysis'
import { customsProfileFor, type CustomsProfile } from './customsClassification'
import { classifyNcmRemote, mergeFullCustomsProfile } from './authenticatedNcmClient'
import type { FullNcmApiResult } from './fullNcmClient'
import type { Inputs } from './types'

export type ProductAnalysisV2 = Omit<ProductAnalysis, 'usageReservationId'> & {
  customs: CustomsProfile
  /** Ephemeral only while the same paid case is still allowed to refine NCM. */
  usageReservationId?: string
  classificationRefinement?: {
    allowed: boolean
    attempt: number
    maxAttempts: number
  }
}

function unclassifiedCustoms(originCountry?: string | null): CustomsProfile {
  // Ingestion and nomenclature are intentionally separate. Before the user
  // confirms the product ficha we keep NCM/economics blank even if a seed
  // classifier could guess from the title.
  return customsProfileFor('', originCountry || '', '')
}

export async function ingestAlibabaUrlV2(url: string): Promise<ProductAnalysis & { customs: CustomsProfile }> {
  // Reading/prefilling the supplier ficha is free. The paid analysis begins only
  // after the user confirms the product and asks ShippingAPP to analyze it.
  const base = await readAlibabaProduct(url)
  return { ...base, customs: unclassifiedCustoms(base.product.originCountry) }
}

async function ensurePaidAnalysis(base: ProductAnalysis): Promise<ProductAnalysis> {
  if (base.usageReservationId?.trim()) return base
  return startImportAnalysis(base)
}

export async function enrichProductAnalysisV2(base: ProductAnalysis): Promise<ProductAnalysisV2> {
  // The credit boundary lives here: this function is reached only when the user
  // asks to actually analyze the confirmed product. Free intake never reserves
  // quota. Once reserved, all NCM clarification iterations reuse the same case.
  const paidBase = await ensurePaidAnalysis(base)

  // Alibaba often gives us a very descriptive title but no explicit category.
  // The continuation reservation still represents the same product, so using
  // the title as classification context is safer than sending an empty category.
  const classificationCategory = paidBase.product.category.trim() || paidBase.product.name.trim()
  const localCustoms = customsProfileFor(classificationCategory, paidBase.product.originCountry, paidBase.product.name)
  let customs = localCustoms
  let refinement: ProductAnalysisV2['classificationRefinement']

  try {
    const full = await classifyNcmRemote({
      name: paidBase.product.name,
      category: classificationCategory,
      material: paidBase.product.material ?? null,
      functionText: paidBase.product.functionText ?? null,
      description: paidBase.product.description ?? null,
    }, paidBase.usageReservationId || '') as FullNcmApiResult & {
      refinement?: { allowed?: boolean; attempt?: number; maxAttempts?: number }
    }
    customs = mergeFullCustomsProfile(localCustoms, full)
    if (full.refinement) {
      refinement = {
        allowed: full.refinement.allowed === true,
        attempt: Number(full.refinement.attempt) || 0,
        maxAttempts: Number(full.refinement.maxAttempts) || 0,
      }
    }
  } catch {
    customs = {
      ...localCustoms,
      source: `${localCustoms.source} Full-catalog retrieval no disponible; fallback seed fail-closed.`,
      rationale: [...localCustoms.rationale, 'No se pudo consultar la snapshot full-catalog; no se amplió ni inventó la clasificación.'],
    }
  }

  const { usageReservationId, ...cleanBase } = paidBase
  const classificationResolved = !!customs.ncmCandidate
    && (customs.classificationConfidence === 'high' || customs.classificationConfidence === 'medium')
    && customs.dutyRatePct !== null
    && customs.dutyRatePct !== undefined
  const keepReservation = !classificationResolved
    && refinement?.allowed === true
    && Boolean(usageReservationId)

  // Market evidence and customs evidence are independent. A missing/LOW duty
  // blocks landed-cost economics through decisionReadiness, but must not erase
  // a valid local-market observation that is still useful to the user.
  return {
    ...cleanBase,
    ...(keepReservation ? { usageReservationId } : {}),
    ...(refinement ? { classificationRefinement: refinement } : {}),
    customs,
  }
}

/** Legacy full paid scan kept for old callers; the primary journey uses free intake + enrich. */
export async function analyzeAlibabaUrlV2(url: string): Promise<ProductAnalysisV2> {
  return enrichProductAnalysisV2(await readAlibabaProduct(url))
}

export function applyAnalysisV2(current: Inputs, analysis: ProductAnalysisV2): Inputs {
  const base = applyAnalysis(current, analysis)
  return {
    ...base,
    // A new scan must replace the previous product's customs state. Missing/LOW
    // confidence resets the numeric field instead of retaining stale duty.
    dutyRatePct: analysis.customs.dutyRatePct ?? 0,
    dutyRateVerified: false,
    statisticsRatePct: analysis.customs.statisticsRatePct,
    vatRatePct: analysis.customs.vatRatePct ?? base.vatRatePct,
    vatPerceptionPct: analysis.customs.vatAdditionalRatePct ?? base.vatPerceptionPct,
    gainsPerceptionPct: analysis.customs.gainsRatePct ?? base.gainsPerceptionPct,
    iibbPerceptionPct: analysis.customs.iibbRatePct ?? base.iibbPerceptionPct,
  }
}
