import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './enrich'

function env(extra: Record<string, unknown> = {}) {
  return {
    AI: { run: async () => ({ response: '{}' }) },
    ASSETS: { fetch: async () => new Response('{}', { status: 404 }) },
    ...extra,
  } as any
}

function mlJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('MercadoLibre benchmark endpoints', () => {
  it('renders the OAuth callback code page without exposing token fields', async () => {
    const response = await worker.fetch(new Request('https://shippingapp.test/oauth/mercadolibre/callback?code=abc123'), env())
    expect(response.status).toBe(200)
    const body = await response.text()

    expect(body).toContain('abc123')
    expect(body).toContain('MercadoLibre autorizó ShippingAPP')
    expect(body).not.toContain('access_token')
    expect(body).not.toContain('client_secret')
  })

  it('reports missing MercadoLibre configuration without exposing secrets', async () => {
    const response = await worker.fetch(new Request('https://shippingapp.test/api/mercadolibre/status'), env())
    expect(response.status).toBe(200)
    const body: any = await response.json()

    expect(body.service).toBe('Mercado Libre Argentina API')
    expect(body.auth.status).toBe('configuration_required')
    expect(body.auth.ready).toBe(false)
    expect(body.auth.required).toContain('MERCADOLIBRE_CLIENT_ID')
    expect(JSON.stringify(body)).not.toContain('accessToken')
    expect(JSON.stringify(body)).not.toContain('Bearer')
  })

  it('fails closed when benchmark is requested without MercadoLibre auth', async () => {
    const response = await worker.fetch(new Request('https://shippingapp.test/api/mercadolibre/benchmark', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productName: 'Paleta de pádel carbono', category: 'Padel racket' }),
    }), env())
    expect(response.status).toBe(200)
    const body: any = await response.json()

    expect(body.status).toBe('configuration_required')
    expect(body.auth.ready).toBe(false)
    expect(body.market.suggestedPriceArs).toBeNull()
    expect(body.market.comparables).toEqual([])
  })

  it('rejects an empty MercadoLibre benchmark request', async () => {
    const response = await worker.fetch(new Request('https://shippingapp.test/api/mercadolibre/benchmark', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }), env())
    expect(response.status).toBe(400)
  })

  it('returns authenticated live comparable prices without leaking the token', async () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: `MLA${i + 1}`,
      title: `Paleta Padel Carbono EVA Pro ${i + 1}`,
      price: 95000 + i * 2500,
      currency_id: 'ARS',
      condition: 'new',
      category_id: 'MLA1276',
      permalink: `https://articulo.mercadolibre.com.ar/MLA-${i + 1}`,
      seller: { id: 1000 + i },
    }))
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect((init?.headers as any)?.authorization).toBe('Bearer test-ml-token')
      const url = String(input)
      if (url.includes('/sites/MLA/domain_discovery/search')) {
        return mlJson([{ category_id: 'MLA1276', category_name: 'Paletas de Paddle' }])
      }
      if (url.includes('/sites/MLA/search')) {
        return mlJson({ paging: { total: items.length }, results: items })
      }
      if (url.includes('/sale_price')) {
        const id = Number(url.match(/MLA(\d+)/)?.[1] || '1')
        return mlJson({ amount: 90000 + id * 2000, currency_id: 'ARS' })
      }
      return mlJson({ error: 'not found' }, 404)
    })
    vi.stubGlobal('fetch', fetchImpl)

    const response = await worker.fetch(new Request('https://shippingapp.test/api/mercadolibre/benchmark', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productName: 'Paleta de pádel carbono EVA', category: 'Padel racket' }),
    }), env({ MERCADOLIBRE_ACCESS_TOKEN: 'test-ml-token' }))
    expect(response.status).toBe(200)
    const body: any = await response.json()

    expect(body.status).toBe('live')
    expect(body.auth.ready).toBe(true)
    expect(body.auth.tokenSource).toBe('static_access_token')
    expect(body.market.comparableCount).toBeGreaterThanOrEqual(5)
    expect(body.market.suggestedPriceArs).toBeGreaterThan(0)
    expect(body.market.comparables[0].priceSource).toBe('sale_price')
    expect(JSON.stringify(body)).not.toContain('test-ml-token')
  })
})
