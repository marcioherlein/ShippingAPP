export type MercadoPagoWebhookTopic =
  | 'subscription_preapproval'
  | 'subscription_authorized_payment'
  | 'subscription_preapproval_plan'

export type VerifiedMercadoPagoWebhook = {
  topic: MercadoPagoWebhookTopic
  resourceId: string
  providerEventId: string
  rawBody: string
  payloadSha256: string
}

const ALLOWED_TOPICS = new Set<MercadoPagoWebhookTopic>([
  'subscription_preapproval',
  'subscription_authorized_payment',
  'subscription_preapproval_plan',
])

function clean(value: unknown, max = 191) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized && normalized.length <= max && !/[\r\n]/.test(normalized) ? normalized : null
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hmacSha256(secret: string, value: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
}

export async function sha256Hex(value: string) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

function constantTimeHexEqual(left: string, right: string) {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false
  const a = left.toLowerCase()
  const b = right.toLowerCase()
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

function parseSignature(header: string | null) {
  if (!header || header.length > 512 || /[\r\n]/.test(header)) return null
  const parts = new Map<string, string>()
  for (const raw of header.split(',')) {
    const [name, ...rest] = raw.trim().split('=')
    const value = rest.join('=').trim()
    if (name && value) parts.set(name.toLowerCase(), value)
  }
  const ts = clean(parts.get('ts'), 40)
  const v1 = clean(parts.get('v1'), 128)
  return ts && v1 && /^[0-9]+$/.test(ts) && /^[0-9a-f]{64}$/i.test(v1) ? { ts, v1 } : null
}

export async function verifyMercadoPagoWebhook(request: Request, secret: string): Promise<VerifiedMercadoPagoWebhook | null> {
  if (typeof secret !== 'string' || secret.length < 32 || /[\r\n]/.test(secret)) return null
  const url = new URL(request.url)
  const resourceId = clean(url.searchParams.get('data.id') ?? url.searchParams.get('data_id'))
  const requestId = clean(request.headers.get('x-request-id'))
  const signature = parseSignature(request.headers.get('x-signature'))
  if (!resourceId || !requestId || !signature) return null

  const manifest = `id:${resourceId};request-id:${requestId};ts:${signature.ts};`
  const expected = await hmacSha256(secret, manifest)
  if (!constantTimeHexEqual(expected, signature.v1)) return null

  let rawBody: string
  try { rawBody = await request.clone().text() } catch { return null }
  if (!rawBody || rawBody.length > 262_144) return null
  let body: any
  try { body = JSON.parse(rawBody) } catch { return null }

  const queryTopic = clean(url.searchParams.get('type'), 80)
  const bodyTopic = clean(body?.type, 80)
  const topic = (queryTopic ?? bodyTopic) as MercadoPagoWebhookTopic | null
  if (!topic || !ALLOWED_TOPICS.has(topic)) return null
  if (queryTopic && bodyTopic && queryTopic !== bodyTopic) return null
  if (clean(body?.data?.id == null ? null : String(body.data.id)) !== resourceId) return null

  const providerEventId = clean(body?.id == null ? null : String(body.id), 191)
  if (!providerEventId) return null

  return {
    topic,
    resourceId,
    providerEventId,
    rawBody,
    payloadSha256: await sha256Hex(rawBody),
  }
}
