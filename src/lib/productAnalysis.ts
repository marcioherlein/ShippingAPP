import type { Inputs } from './types'

export type FxEvidence = {
  status: 'live' | 'unavailable'
  arsPerUsd: number | null
  sourceDate: string | null
  source: string
  code: 'REF'
  note: string
}

export type ProductAnalysis = {
  sourceUrl: string
  fetched: boolean
  product: {
    name: string
    category: string
    unitPriceUsd: number | null
    moq: number | null
    packedWeightKg: number
    volumeCbm: number
    originCountry: string
    imageUrl: string | null
  }
  market: {
    estimatedPriceArs: number | null
    estimatedMonthlyDemand: number
    source: string
  }
  fx?: FxEvidence
  suggestedQuantities: number[]
  confidence: {
    overall: number
    productSource: string
    logistics: string
    market: string
  }
  assumptions: string[]
}

export async function analyzeAlibabaUrl(url: string): Promise<ProductAnalysis> {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  const data = await response.json() as ProductAnalysis & { error?: string }
  if (!response.ok) throw new Error(data.error || 'No pudimos analizar el link.')
  return data
}

export function applyAnalysis(current: Inputs, analysis: ProductAnalysis): Inputs {
  const price = analysis.product.unitPriceUsd
  const moq = analysis.product.moq || analysis.suggestedQuantities[0] || 100
  const liveFx = analysis.fx?.status === 'live' && analysis.fx.arsPerUsd && analysis.fx.arsPerUsd > 0
    ? analysis.fx.arsPerUsd
    : 0
  return {
    ...current,
    quantities: analysis.suggestedQuantities,
    priceTiers: price ? [{ minQuantity: moq, unitPriceUsd: price }] : current.priceTiers,
    weightKg: analysis.product.packedWeightKg,
    volumeCbm: analysis.product.volumeCbm,
    // New scans cannot inherit another product's local benchmark or FX.
    marketPriceArs: analysis.market.estimatedPriceArs || 0,
    usdArs: liveFx,
    monthlyDemand: analysis.market.estimatedMonthlyDemand || current.monthlyDemand,
  }
}
