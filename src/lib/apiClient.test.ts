import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, setApiTokenProvider } from './apiClient'

describe('apiFetch authentication and metering transport boundary', () => {
  afterEach(() => {
    setApiTokenProvider(null)
    vi.unstubAllGlobals()
  })

  it('attaches a bearer session only to same-origin API calls', async () => {
    setApiTokenProvider(async () => 'session-token')
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Response('{}', { status: 200, headers: init?.headers }))
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/api/analyze', { method: 'POST' })
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get('authorization')).toBe('Bearer session-token')
  })

  it('never leaks a Clerk token to an external URL', async () => {
    setApiTokenProvider(async () => 'session-token')
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('https://example.com/api/collect')
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.has('authorization')).toBe(false)
  })

  it('preserves caller headers while adding authentication', async () => {
    setApiTokenProvider(async () => 'session-token')
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/api/intake', { headers: { 'content-type': 'application/json', 'x-test': 'yes' } })
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-test')).toBe('yes')
    expect(headers.get('authorization')).toBe('Bearer session-token')
  })

  it('reuses the current in-memory session when Clerk throws a transient browser DOMException', async () => {
    const provider = vi.fn()
      .mockResolvedValueOnce('working-session-token')
      .mockRejectedValueOnce(new DOMException('The string did not match the expected pattern'))
    setApiTokenProvider(provider)
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/api/me')
    await apiFetch('/api/product-read', { method: 'POST', body: '{}' })

    const secondHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers)
    expect(secondHeaders.get('authorization')).toBe('Bearer working-session-token')
  })

  it('explains authentication failures and never reuses a rejected token', async () => {
    const provider = vi.fn().mockResolvedValueOnce('rejected-token').mockRejectedValueOnce(new Error('storage unavailable'))
    setApiTokenProvider(provider)
    const fetchMock = vi.fn(async () => new Response('{"error":"Unauthorized."}', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiFetch('/api/opportunity-search', { method: 'POST' })).rejects.toThrow('Ingresá a tu cuenta para continuar')
    await expect(apiFetch('/api/intake', { method: 'POST' })).rejects.toThrow('No pude validar tu sesión')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('clears cached authentication when the provider reports no session', async () => {
    setApiTokenProvider(vi.fn().mockResolvedValueOnce('old-token').mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('storage unavailable')))
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await apiFetch('/api/me')
    await apiFetch('/api/me')
    await expect(apiFetch('/api/intake')).rejects.toThrow('No pude validar tu sesión')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('leaves third-party authentication responses untouched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unauthorized', { status: 401 })))
    expect((await apiFetch('https://example.com/api/products')).status).toBe(401)
  })

  it('adds an opaque idempotency key to metered POSTs without trusting the browser for entitlement data', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/api/opportunity-search', { method: 'POST', body: '{}' })
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get('idempotency-key')).toMatch(/^op-.{8,}$/)
    expect(headers.has('x-shippingapp-plan')).toBe(false)
    expect(headers.has('x-shippingapp-credits')).toBe(false)
  })

  it('preserves a caller-provided idempotency key for an intentional retry', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/api/discover', {
      method: 'POST',
      headers: { 'idempotency-key': 'retry-operation-12345' },
      body: '{}',
    })
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get('idempotency-key')).toBe('retry-operation-12345')
  })

  it('does not add metering idempotency headers to read-only or unmetered APIs', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/api/history', { method: 'GET' })
    await apiFetch('/api/history', { method: 'POST', body: '{}' })
    await apiFetch('/api/usage', { method: 'GET' })

    for (const call of fetchMock.mock.calls) {
      const headers = new Headers(call[1]?.headers)
      expect(headers.has('idempotency-key')).toBe(false)
    }
  })
})
