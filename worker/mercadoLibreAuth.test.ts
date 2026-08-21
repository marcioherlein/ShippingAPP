import { describe, expect, it, vi } from 'vitest'
import { resolveMercadoLibreAccessToken, type MercadoLibreTokenStore } from './mercadoLibreAuth'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('Mercado Libre OAuth token lifecycle', () => {
  it('accepts a temporary Worker access-token secret without exposing it elsewhere', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const result = await resolveMercadoLibreAccessToken({ MERCADOLIBRE_ACCESS_TOKEN: ' temporary-token ' }, fetchImpl)

    expect(result).toEqual({ status: 'ready', accessToken: 'temporary-token', source: 'static_access_token' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('reuses a still-valid token from durable storage', async () => {
    const now = 1_800_000_000_000
    const stored = JSON.stringify({ accessToken: 'stored-access', refreshToken: 'stored-refresh', expiresAt: now + 60 * 60 * 1000 })
    const store: MercadoLibreTokenStore = { get: vi.fn(async () => stored), put: vi.fn(async () => undefined) }
    const fetchImpl = vi.fn<typeof fetch>()

    const result = await resolveMercadoLibreAccessToken({
      MERCADOLIBRE_CLIENT_ID: 'client',
      MERCADOLIBRE_CLIENT_SECRET: 'secret',
      MERCADOLIBRE_REFRESH_TOKEN: 'bootstrap',
      MERCADOLIBRE_TOKEN_STORE: store,
    }, fetchImpl, now)

    expect(result).toEqual({ status: 'ready', accessToken: 'stored-access', source: 'token_store' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refreshes before expiry and persists both newly rotated tokens', async () => {
    const now = 1_800_000_000_000
    let written = ''
    const store: MercadoLibreTokenStore = {
      get: vi.fn(async () => null),
      put: vi.fn(async (_key, value) => { written = value }),
    }
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe('https://api.mercadolibre.com/oauth/token')
      expect(init?.method).toBe('POST')
      const body = init?.body as URLSearchParams
      expect(body.get('grant_type')).toBe('refresh_token')
      expect(body.get('client_id')).toBe('client')
      expect(body.get('client_secret')).toBe('secret')
      expect(body.get('refresh_token')).toBe('bootstrap-refresh')
      return json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 21600, token_type: 'Bearer' })
    })

    const result = await resolveMercadoLibreAccessToken({
      MERCADOLIBRE_CLIENT_ID: 'client',
      MERCADOLIBRE_CLIENT_SECRET: 'secret',
      MERCADOLIBRE_REFRESH_TOKEN: 'bootstrap-refresh',
      MERCADOLIBRE_TOKEN_STORE: store,
    }, fetchImpl, now)

    expect(result).toEqual({ status: 'ready', accessToken: 'new-access', source: 'refresh' })
    expect(JSON.parse(written)).toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresAt: now + 21600 * 1000,
    })
  })

  it('requires durable configuration instead of silently calling the API unauthenticated', async () => {
    const result = await resolveMercadoLibreAccessToken({})
    expect(result.status).toBe('configuration_required')
    expect(result.accessToken).toBeNull()
  })
})
