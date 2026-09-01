import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadEmailPreferences, saveEmailPreferences } from './emailPreferences'
import { setApiTokenProvider } from './apiClient'

afterEach(() => {
  vi.unstubAllGlobals()
  setApiTokenProvider(null)
})

describe('Stage 6 email preferences client', () => {
  it('loads owner preferences through the authenticated API client', async () => {
    const fetchMock = vi.fn(async () => Response.json({
      preferences: {
        digestEnabled: true,
        alertsEnabled: false,
        marketingEnabled: false,
        timezone: 'America/Argentina/Buenos_Aires',
        updatedAt: '2026-09-01T12:00:00.000Z',
        transactional: { configurable: false, note: 'Operativo' },
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadEmailPreferences()).resolves.toMatchObject({
      digestEnabled: true,
      alertsEnabled: false,
      timezone: 'America/Argentina/Buenos_Aires',
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/email-preferences', expect.objectContaining({ headers: expect.any(Headers) }))
  })

  it('PATCHes only the caller-provided preference contract', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => Response.json({
      preferences: {
        digestEnabled: false,
        alertsEnabled: true,
        marketingEnabled: true,
        timezone: 'UTC',
        updatedAt: '2026-09-01T12:00:00.000Z',
        transactional: { configurable: false, note: 'Operativo' },
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await saveEmailPreferences({ digestEnabled: false, marketingEnabled: true })
    expect(result.digestEnabled).toBe(false)
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({ digestEnabled: false, marketingEnabled: true })
  })

  it('fails closed on non-success responses instead of inventing local preference state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'unauthorized' }, { status: 401 })))
    await expect(loadEmailPreferences()).rejects.toThrow('unauthorized')
  })
})
