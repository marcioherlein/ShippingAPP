import type { Inputs } from './types'
import { apiFetch } from './apiClient'

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
  /**
   * Ephemeral server-issued reservation used only to continue a one-credit full
   * analysis into NCM classification. Product intake itself is intentionally
   * zero-credit and therefore never receives this reservation.
   */
  usageReservationId?: string
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

function withReservation(response: Response, data: ProductAnalysis) {
  const usageReservationId = response.headers.get('x-shippingapp-usage-reservation')?.trim()
  return usageReservationId ? { ...data, usageReservationId } : data
}

/**
 * Zero-credit product intake. This endpoint only tries to identify/prefill the
 * supplier ficha; it does not classify NCM, query the Argentina market, or
 * consume one of the user's analysis credits.
 */
export async function readAlibabaProduct(url: string): Promise<ProductAnalysis> {
  const response = await apiFetch('/api/product-read', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  const data = await response.json() as ProductAnalysis & { error?: string }
  if (!response.ok) throw new Error(data.error || 'No pudimos leer el link de Alibaba.')
  return data
}

/**
 * Starts the paid unit of value: one complete import analysis. The confirmed
 * product facts are sent to the server without customs output. The server
 * reserves exactly one credit, hydrates live market/FX evidence, and returns a
 * reservation that authorizes the NCM continuation for this same product.
 */
export async function startImportAnalysis(base: ProductAnalysis): Promise<ProductAnalysis> {
  const response = await apiFetch('/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sourceUrl: base.sourceUrl,
      fetched: base.fetched,
      sourceRead: base.sourceRead ?? null,
      product: base.product,
      suggestedQuantities: base.suggestedQuantities,
      confidence: base.confidence,
      assumptions: base.assumptions,
    }),
  })
  const data = await response.json() as ProductAnalysis & { error?: string; code?: string }
  if (!response.ok) {
    if (response.status === 402 || data.code === 'usage_exhausted') {
      throw new Error('Tu producto está listo. Para clasificar la NCM y calcular el costo puesto necesitás 1 análisis disponible.')
    }
    throw new Error(data.error || 'No pudimos iniciar el análisis de importación.')
  }
  return withReservation(response, data)
}

/** Legacy paid Alibaba entry point retained for compatibility and diagnostics. */
export async function analyzeAlibabaUrl(url: string): Promise<ProductAnalysis> {
  const response = await apiFetch('/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  const data = await response.json() as ProductAnalysis & { error?: string }
  if (!response.ok) throw new Error(data.error || 'No pudimos analizar el link.')
  return withReservation(response, data)
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
