import { analyzeAlibabaUrl, applyAnalysis, type ProductAnalysis } from './productAnalysis'
import { customsProfileFor, type CustomsProfile } from './customsClassification'
import type { Inputs } from './types'

export type ProductAnalysisV2 = ProductAnalysis & { customs: CustomsProfile }

export async function analyzeAlibabaUrlV2(url: string): Promise<ProductAnalysisV2> {
  const base = await analyzeAlibabaUrl(url)
  const customs = customsProfileFor(base.product.category, base.product.originCountry, base.product.name)
  const market = customs.dutyRatePct === null
    ? { ...base.market, estimatedPriceArs: null, source: `${base.market.source} · economics blocked pending customs classification` }
    : base.market
  return { ...base, market, customs }
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
