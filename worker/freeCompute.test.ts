import { describe, expect, it, vi } from 'vitest'
import { dispatchComputeRequest } from './freeCompute'
import { ShippingCompute } from './entry'

describe('Workers Free compute boundary', () => {
  it('forwards concurrent requests independently, preserving bodies, credentials and responses', async () => {
    const seen: Request[] = []
    const ids: unknown[] = []
    const namespace = {
      newUniqueId: () => crypto.randomUUID(),
      get(id: unknown) {
        ids.push(id)
        return { fetch: async (request: Request) => {
          seen.push(request)
          return new Response(await request.text(), { status: 202, headers: { 'x-request-id': 'original' } })
        } }
      },
    }
    const local = vi.fn()
    const requests = ['first', 'second'].map(body => new Request('https://shipping.test/api/intake', {
      method: 'POST', body, headers: { authorization: 'Bearer test-session' },
    }))
    const responses = await Promise.all(requests.map(request => dispatchComputeRequest(request, {
      FREE_COMPUTE_ENABLED: 'true', SHIPPING_COMPUTE: namespace,
    }, local)))
    expect(new Set(ids).size).toBe(2)
    expect(seen).toEqual(requests)
    expect(seen[0].headers.get('authorization')).toBe('Bearer test-session')
    expect(await Promise.all(responses.map(response => response.text()))).toEqual(['first', 'second'])
    expect(responses.every(response => response.status === 202 && response.headers.get('x-request-id') === 'original')).toBe(true)
    expect(local).not.toHaveBeenCalled()
  })

  it('does not retry or fall back after a failed dispatch that may already have consumed credit', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('private quota details'))
    const local = vi.fn()
    const response = await dispatchComputeRequest(new Request('https://shipping.test/api/analyze', { method: 'POST' }), {
      FREE_COMPUTE_ENABLED: 'true',
      SHIPPING_COMPUTE: { newUniqueId: () => 'id', get: () => ({ fetch }) },
    }, local)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private quota details')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(local).not.toHaveBeenCalled()
  })

  it('fails closed if enabled without a binding, while static routes stay local', async () => {
    const local = vi.fn(async () => new Response('asset'))
    const env = { FREE_COMPUTE_ENABLED: 'true' }
    expect((await dispatchComputeRequest(new Request('https://shipping.test/api/chat'), env, local)).status).toBe(503)
    expect(local).not.toHaveBeenCalled()
    expect(await (await dispatchComputeRequest(new Request('https://shipping.test/'), env, local)).text()).toBe('asset')
  })

  it('still enforces authentication inside the object and ignores forged trusted identity', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const compute = new ShippingCompute({}, {
        AUTH_ENFORCEMENT: 'true', FREE_COMPUTE_ENABLED: 'true',
        CLERK_SECRET_KEY: 'test', CLERK_PUBLISHABLE_KEY: 'test', CLERK_JWT_KEY: 'test', DB: {},
      })
      const response = await compute.fetch(new Request('https://shipping.test/api/intake', {
        method: 'POST', headers: { 'x-shippingapp-user-id': 'forged', 'x-shippingapp-auth-kind': 'user' },
        body: '{}',
      }))
      expect(response.status).toBe(401)
    } finally { log.mockRestore() }
  })
})
