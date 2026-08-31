import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('./apiClient', () => ({ apiFetch }))

import { addAnalysisToWatchlist, refreshWatchlistItem } from './watchlist'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('watchlist client contract', () => {
  beforeEach(() => apiFetch.mockReset())

  it('sends only the owned analysis id when following a product', async () => {
    apiFetch.mockResolvedValue(jsonResponse({ item: { id: 'watch-1' } }, 201))

    await addAnalysisToWatchlist('analysis-1')

    expect(apiFetch).toHaveBeenCalledTimes(1)
    const [path, init] = apiFetch.mock.calls[0]
    expect(path).toBe('/api/watchlist')
    expect(init).toMatchObject({ method: 'POST' })
    expect(JSON.parse(String(init.body))).toEqual({ analysisId: 'analysis-1' })
    expect(String(init.body)).not.toMatch(/marketPrice|landedCost|grossMargin|userId|sourceUrl|title/)
  })

  it('refreshes by item id with a fresh idempotency header and no economic body', async () => {
    apiFetch.mockResolvedValue(jsonResponse({ item: { id: 'watch-1' }, replayed: false }, 201))

    await refreshWatchlistItem('watch-1')

    expect(apiFetch).toHaveBeenCalledTimes(1)
    const [path, init] = apiFetch.mock.calls[0]
    expect(path).toBe('/api/watchlist-refresh?id=watch-1')
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(init.headers['idempotency-key']).toMatch(/^ui-[0-9a-f-]{36}$/i)
  })
})
