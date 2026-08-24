import type { FullNcmApiResult, FullNcmFacts } from './fullNcmClient'

export type NcmClarificationOption = {
  id: string
  label: string
  value: string
}

export type NcmClarification = {
  id: string
  round: number
  factKey: 'product_scope' | 'principal_function' | 'material' | 'electrical_type' | 'construction' | 'other'
  question: string
  options: NcmClarificationOption[]
  reason: string
}

export type NcmClarificationAnswer = {
  question: string
  answer: string
  factKey?: string
}

export type FullNcmClarificationResult = FullNcmApiResult & {
  clarification?: NcmClarification | null
  tariff?: unknown
}

export function clarificationFrom(result: FullNcmApiResult | FullNcmClarificationResult): NcmClarification | null {
  const value = (result as FullNcmClarificationResult)?.clarification
  if (!value || typeof value.question !== 'string' || !Array.isArray(value.options) || value.options.length < 2) return null
  return value
}

export async function classifyNcmWithClarifications(
  facts: FullNcmFacts,
  clarifications: NcmClarificationAnswer[],
): Promise<FullNcmClarificationResult> {
  const response = await fetch('/api/ncm-classify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...facts, clarifications: clarifications.slice(0, 3) }),
  })
  if (!response.ok) throw new Error(`Full NCM clarification unavailable (${response.status})`)
  const result = await response.json() as FullNcmClarificationResult
  if (!result || !['candidate', 'missing'].includes(result.status) || typeof result.catalogRecordCount !== 'number') {
    throw new Error('Invalid clarified NCM response')
  }
  return result
}
