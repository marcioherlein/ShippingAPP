import type { Inputs } from './types'

export type FxEvidence = {
  status: 'live' | 'unavailable'
  arsPerUsd: number | null
  sourceDate: string | null
  source: string
  code: 'REF'
  note: string
}

export type SourceReadEvidence = {
  mode: 'direct' | 'browser' | 'partial' | 'blocked' | 'parsebot'
  quality: number
  directStatus: number | null
  browserAttempted: boolean
  browserMsUsed: number | null
  reason: string
}

export type ProductAnalysis = {
  sourceUrl: string
  fetched: boolean
  sourceRead?: SourceReadEvidence
  product: {
    name: string
    category: string
    unitPriceUsd: number | null
    moq: number | null
    packedWeightKg: number
    volumeCbm: number
    originCountry: string
    imageUrl: string | null
    material?: string | null
    functionText?: string | null
    description?: string | null
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
  const moq = analysis.product.moq || analysis.suggestedQuantities[0] || null
  const liveFx = analysis.fx?.status === 'live' && analysis.fx.arsPerUsd && analysis.fx.arsPerUsd > 0
    ? analysis.fx.arsPerUsd
    : 0
  return {
    ...current,
    // Every product analysis owns its commercial state. Missing evidence resets
    // the previous case instead of silently inheriting it.
    quantities: analysis.suggestedQuantities,
    priceTiers: price && moq ? [{ minQuantity: moq, unitPriceUsd: price }] : [],
    weightKg: analysis.product.packedWeightKg,
    volumeCbm: analysis.product.volumeCbm,
    marketPriceArs: analysis.market.estimatedPriceArs || 0,
    usdArs: liveFx,
    monthlyDemand: analysis.market.estimatedMonthlyDemand > 0 ? analysis.market.estimatedMonthlyDemand : 0,
  }
}