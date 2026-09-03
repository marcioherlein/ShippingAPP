import { describe, expect, it, vi } from 'vitest'
import { productRead } from './entry'

function req(url: unknown) {
  return new Request('https://shipping.test/api/product-read', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  })
}

const validAlibaba = 'https://www.alibaba.com/product-detail/Sample_1600000000000.html'

describe('product-read transient reliability (Case C class of failures)', () => {
  it('rejects an invalid link as a permanent, non-retryable client error', async () => {
    const reader = vi.fn()
    const response = await productRead(req('not a url'), {}, reader as any)
    expect(response.status).toBe(400)
    const body = await response.json() as any
    expect(body.code).toBe('invalid_link')
    expect(body.retryable).toBe(false)
    expect(reader).not.toHaveBeenCalled()
  })

  it('recovers a transient failure with a single bounded retry (503 on read #1, 200 on read #2)', async () => {
    const reader = vi.fn()
      .mockRejectedValueOnce(new Error('Worker exceeded resource limits'))
      .mockResolvedValueOnce({ product: { name: 'Sample' }, sourceRead: { mode: 'direct' } })
    const response = await productRead(req(validAlibaba), {}, reader as any)
    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.product.name).toBe('Sample')
    expect(reader).toHaveBeenCalledTimes(2)
  })

  it('surfaces a structured, retryable 503 (never a dead-end) when the provider keeps failing', async () => {
    const reader = vi.fn().mockRejectedValue(new Error('Worker exceeded resource limits'))
    const response = await productRead(req(validAlibaba), {}, reader as any)
    expect(response.status).toBe(503)
    const body = await response.json() as any
    expect(body.code).toBe('transient_provider_error')
    expect(body.retryable).toBe(true)
    expect(body.stage).toBe('alibaba_product_read')
    expect(body.detail).toContain('resource limits')
    // Bounded: never retried more than once.
    expect(reader).toHaveBeenCalledTimes(2)
    // No stack traces / secrets leaked.
    expect(JSON.stringify(body)).not.toMatch(/ at |stack|API_KEY|token/i)
  })

  it('preserves whatever partial ficha the reader returns rather than discarding it', async () => {
    const partial = {
      product: { name: 'Partial item', category: 'Sin clasificar', unitPriceUsd: null },
      sourceRead: { mode: 'partial' },
      confidence: { overall: 30 },
    }
    const reader = vi.fn().mockResolvedValue(partial)
    const response = await productRead(req(validAlibaba), {}, reader as any)
    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.product.name).toBe('Partial item')
    expect(body.sourceRead.mode).toBe('partial')
  })
})
