import { analyzeAlibabaUrl, applyAnalysis, type ProductAnalysis } from './productAnalysis'
import { customsProfileFor, type CustomsProfile } from './customsClassification'
import { classifyNcmRemote, mergeFullCustomsProfile } from './fullNcmClient'
import type { Inputs } from './types'

export type ProductAnalysisV2 = ProductAnalysis & { customs: CustomsProfile }

export async function analyzeAlibabaUrlV2(url: string): Promise<ProductAnalysisV2> {
  const base = await analyzeAlibabaUrl(url)
  const localCustoms = customsProfileFor(base.product.category, base.product.originCountry, base.product.name)
  let customs = localCustoms

  try {
    const full = await classifyNcmRemote({
      name: base.product.name,
      category: base.product.category,
    })
    customs = mergeFullCustomsProfile(localCustoms, full)
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
  return { ...base, customs }
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
