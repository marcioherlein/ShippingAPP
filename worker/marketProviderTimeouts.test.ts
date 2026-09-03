import { describe, expect, it, vi } from 'vitest'
import { createGoogleShoppingArgentinaProvider } from './googleShoppingMarketProvider'
import { createMercadoLibreMarketProviders } from './mercadoLibreMarketProvider'
import { resolveMercadoLibreAccessToken } from './mercadoLibreAuth'

// Regression: every external market provider must bound its fetches with an AbortSignal so a
// hung upstream cannot exhaust the Cloudflare Worker. We assert the signal is wired at the
// fetch call (the abort-after-timeout behavior itself is standard AbortController semantics).

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

describe('market provider fetch timeouts (abort signal wired)', () => {
  it('passes an AbortSignal to every Mercado Libre API call', async () => {
    const seen: Array<AbortSignal | undefined> = []
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      seen.push(init?.signal ?? undefined)
      return jsonResponse([]) // empty predictor/search payloads → provider handles gracefully
    })
    const { discoveryProvider } = createMercadoLibreMarketProviders({ accessToken: 'tok', fetchImpl })
    await discoveryProvider.discover({ query: 'botella', productName: 'botella', category: '' })
    expect(fetchImpl).toHaveBeenCalled()
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((s) => s instanceof AbortSignal)).toBe(true)
  })

  it('passes an AbortSignal to the Google Shopping call', async () => {
    let signal: AbortSignal | undefined
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      signal = init?.signal ?? undefined
      return jsonResponse({ shopping_results: [] })
    })
    const provider = createGoogleShoppingArgentinaProvider({ apiKey: 'k', fetchImpl })
    await provider.discover({ query: 'producto', productName: 'producto', category: '' })
    expect(fetchImpl).toHaveBeenCalled()
    expect(signal).toBeInstanceOf(AbortSignal)
  })

  it('passes an AbortSignal to the Mercado Libre OAuth refresh call', async () => {
    let signal: AbortSignal | undefined
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      signal = init?.signal ?? undefined
      return jsonResponse({ access_token: 'a', refresh_token: 'b', expires_in: 3600 })
    })
    const store = { get: vi.fn(async () => null), put: vi.fn(async () => undefined) }
    await resolveMercadoLibreAccessToken({
      MERCADOLIBRE_CLIENT_ID: 'id',
      MERCADOLIBRE_CLIENT_SECRET: 'secret',
      MERCADOLIBRE_REFRESH_TOKEN: 'refresh',
      MERCADOLIBRE_TOKEN_STORE: store,
    }, fetchImpl)
    expect(fetchImpl).toHaveBeenCalled()
    expect(signal).toBeInstanceOf(AbortSignal)
  })
})
