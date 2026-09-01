import { afterEach, describe, expect, it, vi } from 'vitest'
import { setApiTokenProvider } from './apiClient'
import { loadUsage, usageLabel, type UsageSummary } from './usage'

const sampleUsage: UsageSummary = {
  plan: {
    code: 'free',
    name: 'Free',
    monthlyCredits: 3,
    monitoringEnabled: false,
  },
  period: {
    id: 'period-1',
    start: '2026-08-01T00:00:00.000Z',
    end: '2026-09-01T00:00:00.000Z',
    creditsGranted: 3,
    creditsConsumed: 1,
    creditsRemaining: 2,
  },
}

afterEach(() => {
  setApiTokenProvider(null)
  vi.unstubAllGlobals()
})

describe('usage client', () => {
  it('loads the usage view returned by the authenticated server endpoint', async () => {
    setApiTokenProvider(async () => 'session-token')
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('authorization')).toBe('Bearer session-token')
      return Response.json({ usage: sampleUsage })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadUsage()).resolves.toEqual(sampleUsage)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/usage')
  })

  it('fails closed when the server does not provide an authoritative usage object', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ plan: 'business', credits: 999 }, { status: 200 })))
    await expect(loadUsage()).rejects.toThrow('No pudimos consultar tus créditos.')
  })

  it('formats the badge from the server response and clamps impossible negative display values', () => {
    expect(usageLabel(sampleUsage)).toBe('Free · 2/3 créditos')
    expect(usageLabel({
      ...sampleUsage,
      period: { ...sampleUsage.period, creditsRemaining: -5 },
    })).toBe('Free · 0/3 créditos')
  })
})
