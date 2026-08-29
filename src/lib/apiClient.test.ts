import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, setApiTokenProvider } from './apiClient'

describe('apiFetch authentication boundary', () => {
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
})
