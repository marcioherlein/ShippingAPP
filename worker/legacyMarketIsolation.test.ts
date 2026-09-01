import { describe, expect, it, vi } from 'vitest'
import { analyzeArgentinaMarket } from './catalogProvider'
import { withoutLegacyMarketCredentials } from './entry'
import { resolveMercadoLibreAccessToken } from './mercadoLibreAuth'

const credentialedEnv = () => ({
  MERCADOLIBRE_ACCESS_TOKEN: 'outer-live-token',
  MERCADOLIBRE_CLIENT_ID: 'client-id',
  MERCADOLIBRE_CLIENT_SECRET: 'client-secret',
  MERCADOLIBRE_REFRESH_TOKEN: 'refresh-token',
  MERCADOLIBRE_TOKEN_STORE: {
    get: vi.fn(async () => null),
    put: vi.fn(async () => undefined),
  },
  OTHER_BINDING: 'preserved',
})

describe('legacy Argentina-market isolation', () => {
  it.each(['/api/analyze', '/api/intake'] as const)(
    '%s strips all ML credentials only from the inner legacy environment',
    async (pathname) => {
      const outer = credentialedEnv()
      const inner = withoutLegacyMarketCredentials(outer, pathname) as typeof outer

      expect(inner).not.toBe(outer)
      expect(inner.OTHER_BINDING).toBe('preserved')
      expect(inner.MERCADOLIBRE_ACCESS_TOKEN).toBeUndefined()
      expect(inner.MERCADOLIBRE_CLIENT_ID).toBeUndefined()
      expect(inner.MERCADOLIBRE_CLIENT_SECRET).toBeUndefined()
      expect(inner.MERCADOLIBRE_REFRESH_TOKEN).toBeUndefined()
      expect(inner.MERCADOLIBRE_TOKEN_STORE).toBeUndefined()

      // The authoritative outer overlay still receives the untouched env.
      expect(outer.MERCADOLIBRE_ACCESS_TOKEN).toBe('outer-live-token')
      expect(outer.MERCADOLIBRE_TOKEN_STORE).toBeDefined()

      const auth = await resolveMercadoLibreAccessToken(inner as any)
      expect(auth.status).not.toBe('ready')

      const providerFetch = vi.fn(async () => {
        throw new Error('legacy market provider network must not run')
      })
      const market = await analyzeArgentinaMarket('Logitech M170', 'mouse inalámbrico', {
        accessToken: auth.accessToken,
        fetchImpl: providerFetch as typeof fetch,
      })

      expect(market.status).toBe('configuration_required')
      expect(providerFetch).not.toHaveBeenCalled()
    },
  )

  it('does not strip credentials from the dedicated hybrid benchmark route', () => {
    const outer = credentialedEnv()
    const benchmarkEnv = withoutLegacyMarketCredentials(outer, '/api/argentina-market/benchmark')
    expect(benchmarkEnv).toBe(outer)
    expect((benchmarkEnv as typeof outer).MERCADOLIBRE_ACCESS_TOKEN).toBe('outer-live-token')
  })
})
