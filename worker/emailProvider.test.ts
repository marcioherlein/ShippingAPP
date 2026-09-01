import { describe, expect, it, vi } from 'vitest'
import { EmailProviderError, ResendEmailProvider } from './emailProvider'

const API_KEY = 're_stage6_test_key_0000000000000000000000000000'
const MESSAGE = {
  from: 'ShippingAPP <onboarding@resend.dev>',
  to: 'owner@example.com',
  subject: 'Prueba segura',
  html: '<p>Hola</p>',
  text: 'Hola',
}

describe('Stage 6 Resend provider boundary', () => {
  it('sends only the intended recipient with server idempotency and returns the provider id', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('authorization')).toBe(`Bearer ${API_KEY}`)
      expect(headers.get('idempotency-key')).toBe('mail-event-0001')
      const body = JSON.parse(String(init?.body))
      expect(body.to).toEqual(['owner@example.com'])
      expect(body.subject).toBe('Prueba segura')
      return Response.json({ id: 'email-provider-id-1' })
    })
    const provider = new ResendEmailProvider({ apiKey: API_KEY, fetchImpl: fetchImpl as typeof fetch })
    await expect(provider.send(MESSAGE, { idempotencyKey: 'mail-event-0001' })).resolves.toEqual({ messageId: 'email-provider-id-1' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects CRLF header injection before any provider request', async () => {
    const fetchImpl = vi.fn()
    const provider = new ResendEmailProvider({ apiKey: API_KEY, fetchImpl: fetchImpl as typeof fetch })
    await expect(provider.send({ ...MESSAGE, to: 'owner@example.com\r\nBcc: victim@example.com' }, { idempotencyKey: 'mail-event-0002' }))
      .rejects.toMatchObject({ code: 'invalid_recipient' })
    await expect(provider.send({ ...MESSAGE, subject: 'ok\r\nBcc: victim@example.com' }, { idempotencyKey: 'mail-event-0003' }))
      .rejects.toMatchObject({ code: 'invalid_subject' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sanitizes provider rejection and never surfaces the raw provider response body', async () => {
    const rawSecret = 'provider-debug-secret-that-must-never-escape'
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: rawSecret }), { status: 401 }))
    const provider = new ResendEmailProvider({ apiKey: API_KEY, fetchImpl: fetchImpl as typeof fetch })
    let error: unknown
    try { await provider.send(MESSAGE, { idempotencyKey: 'mail-event-0004' }) } catch (caught) { error = caught }
    expect(error).toBeInstanceOf(EmailProviderError)
    expect((error as EmailProviderError).code).toBe('email_provider_rejected')
    expect(String((error as Error).message)).not.toContain(rawSecret)
  })

  it('marks rate limits and server outages retryable without exposing response details', async () => {
    for (const status of [429, 500, 503]) {
      const provider = new ResendEmailProvider({
        apiKey: API_KEY,
        fetchImpl: (async () => new Response('sensitive-provider-details', { status })) as typeof fetch,
      })
      await expect(provider.send(MESSAGE, { idempotencyKey: `mail-event-${status}` })).rejects.toMatchObject({
        code: 'email_provider_temporarily_unavailable',
        retryable: true,
      })
    }
  })

  it('fails safely when no provider key is configured', async () => {
    const provider = new ResendEmailProvider({ apiKey: null, fetchImpl: vi.fn() as typeof fetch })
    expect(provider.configured).toBe(false)
    await expect(provider.send(MESSAGE, { idempotencyKey: 'mail-event-0005' })).rejects.toMatchObject({
      code: 'email_provider_not_configured',
      retryable: false,
    })
  })
})
