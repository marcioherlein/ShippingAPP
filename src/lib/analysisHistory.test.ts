import { afterEach, describe, expect, it, vi } from 'vitest'
import { historyIdempotencyKey, saveCompletedAnalysis } from './analysisHistory'

const originalFetch = globalThis.fetch

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = originalFetch
})

describe('Stage 3 analysis history client', () => {
  it('produces a stable content-derived idempotency key', async () => {
    const input = { product: 'paleta', budget: 5000 }
    const result = { totalCostUsd: 1200, ncm: '9506.59.00' }
    expect(await historyIdempotencyKey(input, result)).toBe(await historyIdempotencyKey(input, result))
    expect(await historyIdempotencyKey(input, result)).not.toBe(await historyIdempotencyKey(input, { ...result, totalCostUsd: 1300 }))
  })

  it('retries one network interruption with exactly the same idempotency payload', async () => {
    const requests: string[] = []
    let calls = 0
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1
      requests.push(String(init?.body ?? ''))
      if (calls === 1) throw new TypeError('network interrupted after commit')
      return new Response(JSON.stringify({ item: { id: 'analysis-1', productName: 'Paleta' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const item = await saveCompletedAnalysis({ product: 'paleta' }, { total: 1200 })
    expect(item.id).toBe('analysis-1')
    expect(calls).toBe(2)
    expect(requests[0]).toBe(requests[1])
    const firstBody = JSON.parse(requests[0])
    expect(firstBody.idempotencyKey).toMatch(/^completed:[0-9a-f]{64}$/)
  })

  it('does not retry deterministic HTTP validation failures', async () => {
    let calls = 0
    globalThis.fetch = vi.fn(async () => {
      calls += 1
      return new Response(JSON.stringify({ error: 'History payload is invalid.' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    await expect(saveCompletedAnalysis({ product: 'x' }, { bad: true })).rejects.toThrow('History payload is invalid')
    expect(calls).toBe(1)
  })
})
