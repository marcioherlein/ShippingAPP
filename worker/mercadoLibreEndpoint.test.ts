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
  it('accepts MercadoLibre notification callbacks without exposing the payload', async () => {
    const response = await worker.fetch(new Request('https://shippingapp.test/api/mercadolibre/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resource: '/items/MLA123', user_id: 99, secret: 'do-not-leak' }),
    }), env())
    expect(response.status).toBe(200)
    const bodyText = await response.text()
    const body = JSON.parse(bodyText)

    expect(body.status).toBe('ok')
    expect(body.accepted).toBe(true)
    expect(body.payloadSeen).toBe(true)
    expect(bodyText).not.toContain('do-not-leak')
    expect(bodyText).not.toContain('MLA123')
  })

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
    expect(body.auth.apiAccess.status).toBe('not_checked')
    expect(body.auth.required).toContain('MERCADOLIBRE_CLIENT_ID')
    expect(JSON.stringify(body)).not.toContain('accessToken')
    expect(JSON.stringify(body)).not.toContain('Bearer')
  })

  it('validates that a loaded token can actually call MercadoLibre APIs', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe('https://api.mercadolibre.com/users/me')
      expect((init?.headers as any)?.authorization).toBe('Bearer test-ml-token')
      return mlJson({ id: 123, nickname: 'seller' })
    })
    vi.stubGlobal('fetch', fetchImpl)

    const response = await worker.fetch(new Request('https://shippingapp.test/api/mercadolibre/status'), env({
      MERCADOLIBRE_ACCESS_TOKEN: 'test-ml-token',
    }))
    expect(response.status).toBe(200)
    const body: any = await response.json()

    expect(body.auth.ready).toBe(true)
    expect(body.auth.apiReady).toBe(true)
    expect(body.auth.apiAccess.status).toBe('ok')
    expect(JSON.stringify(body)).not.toContain('test-ml-token')
  })

  it('flags loaded MercadoLibre tokens that are forbidden by the API', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => mlJson({ message: 'forbidden' }, 403))
    vi.stubGlobal('fetch', fetchImpl)

    const response = await worker.fetch(new Request('https://shippingapp.test/api/mercadolibre/status'), env({
      MERCADOLIBRE_ACCESS_TOKEN: 'forbidden-token',
    }))
    expect(response.status).toBe(200)
    const body: any = await response.json()

    expect(body.auth.ready).toBe(true)
    expect(body.auth.apiReady).toBe(false)
    expect(body.auth.apiAccess.status).toBe('forbidden')
    expect(body.auth.apiAccess.httpStatus).toBe(403)
    expect(body.auth.apiAccess.reason).toContain('Reauthorize')
    expect(JSON.stringify(body)).not.toContain('forbidden-token')
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

  it('uses public listing search fallback when MercadoLibre rejects Bearer on search endpoints', async () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: `MLA9${i + 1}`,
      title: `Paleta Padel Carbono EVA Control ${i + 1}`,
      price: 120000 + i * 3500,
      currency_id: 'ARS',
      condition: 'new',
      category_id: 'MLA1276',
      permalink: `https://articulo.mercadolibre.com.ar/MLA-9${i + 1}`,
      seller: { id: 2000 + i },
    }))
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      const hasBearer = Boolean((init?.headers as any)?.authorization)
      if (url.includes('/sites/MLA/domain_discovery/search')) {
        return hasBearer
          ? mlJson({ message: 'forbidden' }, 403)
          : mlJson([{ category_id: 'MLA1276', category_name: 'Paletas de Paddle' }])
      }
      if (url.includes('/sites/MLA/search')) {
        return hasBearer
          ? mlJson({ message: 'forbidden' }, 403)
          : mlJson({ paging: { total: items.length }, results: items })
      }
      if (url.includes('/sale_price')) return mlJson({ message: 'forbidden' }, 403)
      return mlJson({ error: 'not found' }, 404)
    })
    vi.stubGlobal('fetch', fetchImpl)

    const response = await worker.fetch(new Request('https://shippingapp.test/api/mercadolibre/benchmark', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productName: 'Paleta de pádel carbono EVA', category: 'Padel racket' }),
    }), env({ MERCADOLIBRE_ACCESS_TOKEN: 'test-ml-token' }))
    expect(response.status).toBe(200)
    const body: any = await response.json()

    // Policy: an unauthenticated public search fallback is NOT promoted to a live benchmark
    // (it must never feed economics). The reference price/comparables are still returned for
    // transparency, clearly labelled, but status stays 'insufficient'.
    expect(body.status).toBe('insufficient')
    expect(body.auth.ready).toBe(true)
    expect(body.market.source).toContain('public search fallback')
    expect(body.market.comparableCount).toBeGreaterThanOrEqual(5)
    expect(body.market.comparables[0].priceSource).toBe('search_price')
    expect(body.market.warnings.join(' ')).toContain('Bearer')
    expect(body.market.warnings.join(' ')).toMatch(/NO se promueve a economics|sin autenticaci/i)
    expect(JSON.stringify(body)).not.toContain('test-ml-token')
  })
})