import { describe, expect, it } from 'vitest'
import { verifyMercadoPagoWebhook } from './mercadoPagoWebhook'

const SECRET = 'stage9-webhook-secret-0123456789abcdef'

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function signature(resourceId: string, requestId: string, ts: string, secret = SECRET) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const manifest = `id:${resourceId};request-id:${requestId};ts:${ts};`
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(manifest)))
}

async function signedRequest(options: {
  resourceId?: string
  requestId?: string
  ts?: string
  bodyResourceId?: string
  topic?: string
  bodyTopic?: string
  eventId?: string
  secret?: string
  overrideSignature?: string
} = {}) {
  const resourceId = options.resourceId ?? 'mp-sub-1'
  const requestId = options.requestId ?? 'request-123'
  const ts = options.ts ?? '1788312000'
  const topic = options.topic ?? 'subscription_preapproval'
  const body = JSON.stringify({
    id: options.eventId ?? 'event-1',
    type: options.bodyTopic ?? topic,
    data: { id: options.bodyResourceId ?? resourceId },
    status: 'authorized',
  })
  const sig = options.overrideSignature ?? await signature(resourceId, requestId, ts, options.secret ?? SECRET)
  return new Request(`https://shippingapp.test/api/billing/webhook/mercadopago?data.id=${encodeURIComponent(resourceId)}&type=${encodeURIComponent(topic)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': requestId,
      'x-signature': `ts=${ts},v1=${sig}`,
    },
    body,
  })
}

describe('Stage 9 Mercado Pago webhook signature boundary', () => {
  it('accepts a correctly signed supported subscription event and hashes its exact body', async () => {
    const request = await signedRequest()
    const verified = await verifyMercadoPagoWebhook(request, SECRET)
    expect(verified).toMatchObject({
      topic: 'subscription_preapproval',
      resourceId: 'mp-sub-1',
      providerEventId: 'event-1',
    })
    expect(verified?.payloadSha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects a forged signature', async () => {
    const request = await signedRequest({ overrideSignature: '0'.repeat(64) })
    expect(await verifyMercadoPagoWebhook(request, SECRET)).toBeNull()
  })

  it('rejects query/body resource confusion even when the query signature is valid', async () => {
    const request = await signedRequest({ resourceId: 'mp-sub-a', bodyResourceId: 'mp-sub-b' })
    expect(await verifyMercadoPagoWebhook(request, SECRET)).toBeNull()
  })

  it('rejects query/body topic confusion and unknown topics', async () => {
    const mismatch = await signedRequest({ topic: 'subscription_preapproval', bodyTopic: 'subscription_authorized_payment' })
    expect(await verifyMercadoPagoWebhook(mismatch, SECRET)).toBeNull()
    const unknown = await signedRequest({ topic: 'payment' })
    expect(await verifyMercadoPagoWebhook(unknown, SECRET)).toBeNull()
  })

  it('rejects missing request identity, short secrets and CRLF signature injection', async () => {
    const valid = await signedRequest()
    const noRequestId = new Request(valid, { headers: { ...Object.fromEntries(valid.headers), 'x-request-id': '' } })
    expect(await verifyMercadoPagoWebhook(noRequestId, SECRET)).toBeNull()
    expect(await verifyMercadoPagoWebhook(await signedRequest(), 'too-short')).toBeNull()

    const crlf = await signedRequest()
    const headers = new Headers(crlf.headers)
    headers.set('x-signature', `ts=1788312000,v1=${'0'.repeat(64)}\r\nX-Forged: yes`)
    const injected = new Request(crlf, { headers })
    expect(await verifyMercadoPagoWebhook(injected, SECRET)).toBeNull()
  })
})
