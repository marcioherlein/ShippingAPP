import type { ProductAnalysis } from './productAnalysis'
import { enrichProductAnalysisV2, type ProductAnalysisV2 } from './productAnalysisV2'
import { apiFetch } from './apiClient'

export type IntakeFacts = {
  name: string | null
  category: string | null
  unitPriceUsd: number | null
  moq: number | null
  packedWeightKg: number | null
  volumeCbm: number | null
  originCountry: string | null
  material: string | null
  functionText: string | null
  description: string | null
}

export type IntakeResult = {
  status: 'needs_input' | 'ready' | 'discovery_pending' | 'clarify'
  intent: 'analyze_product' | 'discover_products' | 'clarify'
  message: string
  searchQuery: string | null
  facts: IntakeFacts
  factSources: { moq: 'user' | 'benchmark' | 'missing'; packedWeightKg: 'user' | 'benchmark' | 'missing'; volumeCbm: 'user' | 'benchmark' | 'missing' }
  missingFields: string[]
  suggestedQuantities: number[]
  assumptions: string[]
  analysis?: ProductAnalysis
}

export type IntakeClientResult = Omit<IntakeResult, 'analysis'> & { analysis?: ProductAnalysisV2 }

export const emptyIntakeFacts = (): IntakeFacts => ({
  name: null, category: null, unitPriceUsd: null, moq: null,
  packedWeightKg: null, volumeCbm: null, originCountry: null,
  material: null, functionText: null, description: null,
})

export async function runProductIntake(message: string, priorFacts: IntakeFacts): Promise<IntakeClientResult> {
  const response = await apiFetch('/api/intake', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, priorFacts }),
  })
  const data = await response.json() as IntakeResult & { error?: string }
  if (!response.ok) throw new Error(data.error || 'No pudimos procesar la descripción del producto.')
  if (!data.analysis) {
    const { analysis: _analysis, error: _error, ...rest } = data
    return rest
  }
  const { analysis, error: _error, ...rest } = data
  const usageReservationId = response.headers.get('x-shippingapp-usage-reservation')?.trim()
  const reservedAnalysis: ProductAnalysis = usageReservationId
    ? { ...analysis, usageReservationId }
    : analysis
  return { ...rest, analysis: await enrichProductAnalysisV2(reservedAnalysis) }
}

export function isAlibabaUrl(value: string) {
  try {
    const url = new URL(value.trim())
    const host = url.hostname.toLowerCase()
    return url.protocol === 'https:' && (host === 'alibaba.com' || host.endsWith('.alibaba.com'))
  } catch {
    return false
  }
}
