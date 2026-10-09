import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, setApiTokenProvider } from './apiClient'
import { getSessionState, setSessionState } from './authSession'

describe('apiFetch authentication and metering transport boundary', () => {
  afterEach(() => {
    setApiTokenProvider(null)
    setSessionState('unmanaged')
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

  it('does not reuse an old token when Clerk cannot provide the current session', async () => {
    const provider = vi.fn()
      .mockResolvedValueOnce('working-session-token')
      .mockRejectedValueOnce(new DOMException('The string did not match the expected pattern'))
    setApiTokenProvider(provider)
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/api/me')
    await expect(apiFetch('/api/product-read', { method: 'POST', body: '{}' })).rejects.toMatchObject({ code: 'auth_token_unavailable' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('explains authentication failures and never reuses a rejected token', async () => {
    const provider = vi.fn().mockResolvedValueOnce('rejected-token').mockRejectedValueOnce(new Error('storage unavailable'))
    setApiTokenProvider(provider)
    const fetchMock = vi.fn(async () => new Response('{"error":"Unauthorized."}', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiFetch('/api/opportunity-search', { method: 'POST' })).rejects.toMatchObject({ code: 'auth_token_unavailable' })
    await expect(apiFetch('/api/intake', { method: 'POST' })).rejects.toMatchObject({ code: 'auth_session_pending' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('clears cached authentication when the provider reports no session', async () => {
    setApiTokenProvider(vi.fn().mockResolvedValueOnce('old-token').mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('storage unavailable')))
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await apiFetch('/api/me')
    await expect(apiFetch('/api/me')).rejects.toMatchObject({ code: 'auth_session_pending' })
    await expect(apiFetch('/api/intake')).rejects.toMatchObject({ code: 'auth_token_unavailable' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('leaves third-party authentication responses untouched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unauthorized', { status: 401 })))
    expect((await apiFetch('https://example.com/api/products')).status).toBe(401)
  })

  it('waits for server-confirmed identity before sending a customer operation', async () => {
    setSessionState('verifying')
    setApiTokenProvider(async () => 'valid-token')
    const fetchMock = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    const request = apiFetch('/api/opportunity-search', { method: 'POST' })
    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()
    setSessionState('ready')
    await request
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refreshes a rejected token once and preserves the operation key and body', async () => {
    const provider = vi.fn(async (fresh?: boolean) => fresh ? 'new-token' : 'expired-token')
    setApiTokenProvider(provider)
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{"code":"auth_session_expired"}', { status: 401 })).mockResolvedValueOnce(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    await apiFetch('/api/analyze', { method: 'POST', body: '{"product":"motorcycle"}' })
    expect(provider.mock.calls).toEqual([[false], [true]])
    const first = new Headers(fetchMock.mock.calls[0][1].headers)
    const second = new Headers(fetchMock.mock.calls[1][1].headers)
    expect(second.get('idempotency-key')).toBe(first.get('idempotency-key'))
    expect(second.get('authorization')).toBe('Bearer new-token')
    expect(fetchMock.mock.calls[1][1].body).toBe('{"product":"motorcycle"}')
  })

  it('does not retry a domain configuration error or call it a signed-out session', async () => {
    setSessionState('ready')
    const provider = vi.fn(async () => 'valid-token')
    setApiTokenProvider(provider)
    const fetchMock = vi.fn(async () => new Response('{"code":"auth_origin_rejected"}', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(apiFetch('/api/analyze', { method: 'POST' })).rejects.toMatchObject({ code: 'auth_origin_rejected' })
    expect(provider).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getSessionState()).toBe('error')
  })

  it('bounds a repeated 401 to two requests', async () => {
    setApiTokenProvider(async () => 'token')
    const fetchMock = vi.fn(async () => new Response('{"code":"unauthorized"}', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(apiFetch('/api/analyze', { method: 'POST' })).rejects.toMatchObject({ code: 'unauthorized' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
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

describe('request deadline', () => {
  it('cancels immediately even when the token provider never resolves', async () => {
    setApiTokenProvider(() => new Promise(() => {}))
    const controller = new AbortController()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const request = apiFetch('/api/opportunity-search', { signal: controller.signal })
    const assertion = expect(request).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await assertion
    expect(fetchMock).not.toHaveBeenCalled()
    setApiTokenProvider(null)
    vi.unstubAllGlobals()
  })
  it('releases a stalled provider request after 30 seconds', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | null = null
    setApiTokenProvider(null)
    vi.stubGlobal('fetch', vi.fn((_input, init) => { signal = init.signal; return new Promise(() => {}) }))
    const request = apiFetch('/api/product-read', { method: 'POST' })
    const assertion = expect(request).rejects.toThrow('30 segundos')
    await vi.advanceTimersByTimeAsync(30_001)
    await assertion
    expect((signal as unknown as AbortSignal).aborted).toBe(true)
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
})
