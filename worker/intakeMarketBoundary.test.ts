import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './entry'
import { INTERNAL_TOKEN_HEADER } from './auth'
const token = 'test-internal-token-0123456789abcdef'
const request = () => new Request('https://shipping.test/api/intake', { method: 'POST', headers: { [INTERNAL_TOKEN_HEADER]: token }, body: '{}' })
import app from './router'
import { overlayHybridMarketEconomics } from './hybridMarketEconomics'

vi.mock('./router', () => ({ default: { fetch: vi.fn() } }))
vi.mock('./hybridMarketEconomics', () => ({ overlayHybridMarketEconomics: vi.fn() }))

afterEach(() => vi.resetAllMocks())

describe('intake authoritative market boundary', () => {
  it('replaces legacy metadata once using the full provider environment', async () => {
    const analysis = { product: { name: 'Logitech M170' }, market: { source: 'configuration_required' }, fx: { arsPerUsd: 1500 } }
    const hydrated = { ...analysis, market: { source: 'Retailers argentinos directos', estimatedPriceArs: 18000 } }
    vi.mocked(app.fetch).mockResolvedValue(Response.json({ status: 'ready', analysis }))
    vi.mocked(overlayHybridMarketEconomics).mockResolvedValue(hydrated)
    const env = { AUTH_ENFORCEMENT: 'true', INTERNAL_API_TOKEN: token, MERCADOLIBRE_ACCESS_TOKEN: 'test-provider-token' }
    const response = await worker.fetch(request(), env)
    expect(response.status).toBe(200)
    expect(overlayHybridMarketEconomics).toHaveBeenCalledExactlyOnceWith(analysis, env)
    expect((await response.json() as any).analysis).toEqual(hydrated)
    expect(vi.mocked(app.fetch).mock.calls[0][1]).not.toHaveProperty('MERCADOLIBRE_ACCESS_TOKEN')
  })

  it('does not call providers while intake needs clarification', async () => {
    vi.mocked(app.fetch).mockResolvedValue(Response.json({ status: 'needs_details', missingFields: ['weight'] }))
    const response = await worker.fetch(request(), { AUTH_ENFORCEMENT: 'true', INTERNAL_API_TOKEN: token })
    expect(response.status).toBe(200)
    expect(overlayHybridMarketEconomics).not.toHaveBeenCalled()
  })
})
