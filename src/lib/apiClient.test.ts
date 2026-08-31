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
