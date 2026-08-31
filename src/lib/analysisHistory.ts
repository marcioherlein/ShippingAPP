import { apiFetch } from './apiClient'

export type AnalysisHistorySummary = {
  id: string
  createdAt: string
  productName: string
  sourceUrl: string | null
  ncmCode: string | null
  selectedMode: string | null
  unitCostUsd: number | null
  totalCostUsd: number | null
}

export type AnalysisHistoryItem = {
  id: string
  createdAt: string
  updatedAt: string
  input: unknown
  result: unknown
}

export type AnalysisHistoryPage = {
  items: AnalysisHistorySummary[]
  nextCursor: string | null
}

async function responseError(response: Response, fallback: string) {
  try {
    const body = await response.json() as { error?: string }
    return body.error || fallback
  } catch {
    return fallback
  }
}

export async function historyIdempotencyKey(input: unknown, result: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify({ input, result }))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `completed:${hex}`
}

export async function saveCompletedAnalysis(input: unknown, result: unknown) {
  const idempotencyKey = await historyIdempotencyKey(input, result)
  const body = JSON.stringify({ idempotencyKey, input, result })

  let response: Response | null = null
  let lastNetworkError: unknown = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await apiFetch('/api/history', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
      break
    } catch (error) {
      lastNetworkError = error
    }
  }

  if (!response) throw lastNetworkError instanceof Error ? lastNetworkError : new Error('No pudimos guardar el análisis.')
  if (!response.ok) throw new Error(await responseError(response, 'No pudimos guardar el análisis.'))
  const data = await response.json() as { item: AnalysisHistorySummary }
  return data.item
}

export async function listAnalysisHistory(options: { cursor?: string | null; limit?: number } = {}): Promise<AnalysisHistoryPage> {
  const params = new URLSearchParams()
  params.set('limit', String(options.limit ?? 20))
  if (options.cursor) params.set('cursor', options.cursor)
  const response = await apiFetch(`/api/history?${params.toString()}`)
  if (!response.ok) throw new Error(await responseError(response, 'No pudimos cargar tu historial.'))
  return response.json() as Promise<AnalysisHistoryPage>
}

export async function getAnalysisHistoryItem(id: string): Promise<AnalysisHistoryItem> {
  const response = await apiFetch(`/api/history-item?id=${encodeURIComponent(id)}`)
  if (!response.ok) throw new Error(await responseError(response, 'No pudimos abrir este análisis.'))
  const data = await response.json() as { item: AnalysisHistoryItem }
  return data.item
}

export async function deleteAnalysisHistoryItem(id: string) {
  const response = await apiFetch(`/api/history-item?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await responseError(response, 'No pudimos eliminar este análisis.'))
}
