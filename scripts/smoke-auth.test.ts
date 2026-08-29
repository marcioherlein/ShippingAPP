import { describe, expect, it } from 'vitest'
import { INTERNAL_TOKEN_HEADER, prepareServiceFetch, smokeServiceConfig } from './smoke-auth.mjs'

const token = 'a'.repeat(48)
const env = {
  PRODUCTION_URL: 'https://shippingapp.marciofabrizio.workers.dev',
  INTERNAL_API_TOKEN: token,
}

describe('privileged production smoke auth', () => {
  it('attaches the service token only to the configured ShippingAPP origin', () => {
    const prepared = prepareServiceFetch(
      'https://shippingapp.marciofabrizio.workers.dev/api/analyze',
      { method: 'POST', headers: { 'content-type': 'application/json' } },
      env,
    )
    const headers = new Headers(prepared.init.headers)
    expect(headers.get(INTERNAL_TOKEN_HEADER)).toBe(token)
    expect(headers.get('content-type')).toBe('application/json')
  })

  it('never forwards the service token to third-party origins', () => {
    const prepared = prepareServiceFetch(
      'https://api.mercadolibre.com/items/MLA1',
      { headers: { accept: 'application/json' } },
      env,
    )
    const headers = new Headers(prepared.init.headers)
    expect(headers.get(INTERNAL_TOKEN_HEADER)).toBeNull()
    expect(headers.get('accept')).toBe('application/json')
  })

  it('does not manufacture an auth header when the secret is absent or malformed', () => {
    expect(smokeServiceConfig({ PRODUCTION_URL: env.PRODUCTION_URL }).token).toBeNull()
    expect(smokeServiceConfig({ ...env, INTERNAL_API_TOKEN: 'too-short' }).token).toBeNull()

    const prepared = prepareServiceFetch(
      `${env.PRODUCTION_URL}/api/runtime-smoke`,
      { headers: { accept: 'application/json' } },
      { PRODUCTION_URL: env.PRODUCTION_URL },
    )
    expect(new Headers(prepared.init.headers).get(INTERNAL_TOKEN_HEADER)).toBeNull()
  })

  it('preserves Request headers while adding the internal token for same-origin requests', () => {
    const request = new Request(`${env.PRODUCTION_URL}/api/runtime-smoke`, {
      headers: { 'x-existing': 'kept' },
    })
    const prepared = prepareServiceFetch(request, {}, env)
    expect(prepared.input).toBeInstanceOf(Request)
    const headers = (prepared.input as Request).headers
    expect(headers.get('x-existing')).toBe('kept')
    expect(headers.get(INTERNAL_TOKEN_HEADER)).toBe(token)
  })
})
