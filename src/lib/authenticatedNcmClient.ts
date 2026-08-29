import { apiFetch } from './apiClient'
import {
  mergeFullCustomsProfile,
  type FullNcmApiResult,
  type FullNcmFacts,
} from './fullNcmClient'

export { mergeFullCustomsProfile }

export async function classifyNcmRemote(facts: FullNcmFacts): Promise<FullNcmApiResult> {
  const response = await apiFetch('/api/ncm-classify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(facts),
  })
  const data = await response.json() as FullNcmApiResult & { error?: string }
  if (!response.ok) throw new Error(data.error || 'No pudimos consultar el nomenclador completo.')
  return data
}
