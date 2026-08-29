import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestContextLimits, withRequestContext } from './requestContext'

const quietConsole = () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
}

afterEach(() => vi.restoreAllMocks())

describe('request safety context', () => {
  it('adds a server-generated request id and ignores a caller supplied id', async () => {
    quietConsole()
    const response = await withRequestContext(
      new Request('https://shipping.test/api/analyze', { method: 'POST', headers: { 'x-request-id': 'attacker-controlled' } }),
      {},
      async () => new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }),
    )

    const requestId = response.headers.get('x-request-id')
    expect(requestId).toBeTruthy()
    expect(requestId).not.toBe('attacker-controlled')
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it('redacts configured provider secrets from API responses', async () => {
    quietConsole()
    const secret = 'parsebot-super-secret-value'
    const response = await withRequestContext(
      new Request('https://shipping.test/api/opportunity-search', { method: 'POST' }),
      { PARSEBOT_API_KEY: secret },
      async () => new Response(JSON.stringify({ error: `provider failed with api_key=${secret}`, api_key: secret }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const text = await response.text()
    expect(text).not.toContain(secret)
    expect(text).toContain('[REDACTED]')
  })

  it('does not expose an uncaught exception message or secret', async () => {
    quietConsole()
    const secret = 'refresh-token-should-never-leak'
    const response = await withRequestContext(
      new Request('https://shipping.test/api/intake', { method: 'POST' }),
      { MERCADOLIBRE_REFRESH_TOKEN: secret },
      async () => { throw new Error(`upstream failed with ${secret}`) },
    )

    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).not.toContain(secret)
    expect(text).not.toContain('upstream failed')
    expect(text).toContain('Internal server error')
  })

  it('rejects a declared oversized API body before invoking the expensive handler', async () => {
    quietConsole()
    const handler = vi.fn(async () => new Response('should not run'))
    const response = await withRequestContext(
      new Request('https://shipping.test/api/analyze', {
        method: 'POST',
        headers: { 'content-length': String(requestContextLimits.maxDeclaredApiBodyBytes + 1) },
        body: '{}',
      }),
      {},
      handler,
    )

    expect(response.status).toBe(413)
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not log query strings such as OAuth authorization codes', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await withRequestContext(
      new Request('https://shipping.test/oauth/mercadolibre/callback?code=oauth-code-sensitive'),
      {},
      async () => new Response('ok', { headers: { 'content-type': 'text/plain' } }),
    )

    expect(response.status).toBe(200)
    const logs = info.mock.calls.flat().join(' ')
    expect(logs).not.toContain('oauth-code-sensitive')
    expect(logs).toContain('/oauth/mercadolibre/callback')
  })

  it('does not alter static asset responses', async () => {
    quietConsole()
    const response = await withRequestContext(
      new Request('https://shipping.test/assets/logo.svg'),
      {},
      async () => new Response('asset', { headers: { etag: 'abc' } }),
    )

    expect(response.headers.get('x-request-id')).toBeNull()
    expect(response.headers.get('etag')).toBe('abc')
    expect(await response.text()).toBe('asset')
  })
})
