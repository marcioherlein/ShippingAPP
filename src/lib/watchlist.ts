import { apiFetch } from './apiClient'

export type WatchlistSnapshot = {
  id: string
  observedAt: string
  marketPriceArs: number | null
  landedCostArs: number | null
  grossMarginPct: number | null
  kind: string
  marketStatus: string
  marketSource: string | null
  provenance: unknown
}

export type WatchlistChanges = {
  marketPricePct: number | null
  landedCostPct: number | null
  grossMarginPoints: number | null
}

export type WatchlistItem = {
  id: string
  analysisId: string | null
  title: string
  sourceUrl: string
  createdAt: string
  updatedAt: string
  ncmCode: string | null
  latestSnapshot: WatchlistSnapshot | null
  previousSnapshot: WatchlistSnapshot | null
  changes: WatchlistChanges
  snapshots: WatchlistSnapshot[]
}

async function responseError(response: Response, fallback: string) {
  try {
    const body = await response.json() as { error?: string }
    return body.error || fallback
  } catch {
    return fallback
  }
}

export async function addAnalysisToWatchlist(analysisId: string) {
  const response = await apiFetch('/api/watchlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ analysisId }),
  })
  if (!response.ok) throw new Error(await responseError(response, 'No pudimos seguir este producto.'))
  const data = await response.json() as { item: WatchlistItem }
  return data.item
}

export async function listWatchlist() {
  const response = await apiFetch('/api/watchlist')
  if (!response.ok) throw new Error(await responseError(response, 'No pudimos cargar tus productos seguidos.'))
  const data = await response.json() as { items: WatchlistItem[] }
  return data.items
}

export async function getWatchlistItem(id: string) {
  const response = await apiFetch(`/api/watchlist-item?id=${encodeURIComponent(id)}`)
  if (!response.ok) throw new Error(await responseError(response, 'No pudimos abrir este seguimiento.'))
  const data = await response.json() as { item: WatchlistItem }
  return data.item
}

export async function removeWatchlistItem(id: string) {
  const response = await apiFetch(`/api/watchlist-item?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await responseError(response, 'No pudimos quitar este producto del seguimiento.'))
}

export async function refreshWatchlistItem(id: string) {
  const idempotencyKey = `ui-${crypto.randomUUID()}`
  const response = await apiFetch(`/api/watchlist-refresh?id=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
  })
  if (!response.ok) throw new Error(await responseError(response, 'No pudimos actualizar este seguimiento.'))
  const data = await response.json() as { item: WatchlistItem; replayed?: boolean }
  return data.item
}
