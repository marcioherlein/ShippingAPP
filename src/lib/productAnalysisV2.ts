import { analyzeAlibabaUrl, applyAnalysis, type ProductAnalysis } from './productAnalysis'
import { customsProfileFor, type CustomsProfile } from './customsClassification'
import type { Inputs } from './types'

export type ProductAnalysisV2 = ProductAnalysis & { customs: CustomsProfile }

export async function analyzeAlibabaUrlV2(url: string): Promise<ProductAnalysisV2> {
  const base = await analyzeAlibabaUrl(url)
  return { ...base, customs: customsProfileFor(base.product.category, base.product.originCountry) }
}

export function applyAnalysisV2(current: Inputs, analysis: ProductAnalysisV2): Inputs {
  const base = applyAnalysis(current, analysis)
  return {
    ...base,
    dutyRatePct: analysis.customs.dutyRatePct ?? current.dutyRatePct,
    dutyRateVerified: false,
    statisticsRatePct: analysis.customs.statisticsRatePct,
  }
}
