import type { EmailPreferenceScope } from './emailTemplates'

export type UnsubscribeScope = Exclude<EmailPreferenceScope, 'transactional'>

export type UnsubscribeTokenPayload = {
  v: 1
  userId: string
  scope: UnsubscribeScope
  exp: number
}

const ALLOWED_SCOPES = new Set<UnsubscribeScope>(['digest', 'alerts', 'marketing'])
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function base64UrlEncode(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid_base64url')
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function validSecret(secret: unknown): secret is string {
  return typeof secret === 'string' && secret.length >= 32 && secret.length <= 512
}

async function importKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

function validatePayload(value: unknown): UnsubscribeTokenPayload | null {
  if (!value || typeof value !== 'object') return null
  const payload = value as Record<string, unknown>
  if (payload.v !== 1) return null
  if (typeof payload.userId !== 'string' || payload.userId.length < 1 || payload.userId.length > 64) return null
  if (typeof payload.scope !== 'string' || !ALLOWED_SCOPES.has(payload.scope as UnsubscribeScope)) return null
  if (!Number.isSafeInteger(payload.exp) || Number(payload.exp) <= 0) return null
  return payload as UnsubscribeTokenPayload
}

export async function createUnsubscribeToken(input: {
  userId: string
  scope: UnsubscribeScope
  secret: string
  expiresAt: Date
}) {
  if (!validSecret(input.secret)) throw new Error('unsubscribe_secret_invalid')
  if (typeof input.userId !== 'string' || input.userId.length < 1 || input.userId.length > 64) throw new Error('unsubscribe_user_invalid')
  if (!ALLOWED_SCOPES.has(input.scope)) throw new Error('unsubscribe_scope_invalid')
  const exp = Math.floor(input.expiresAt.getTime() / 1000)
  if (!Number.isSafeInteger(exp) || exp <= 0) throw new Error('unsubscribe_expiry_invalid')

  const payload: UnsubscribeTokenPayload = { v: 1, userId: input.userId, scope: input.scope, exp }
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
  const key = await importKey(input.secret)
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(encodedPayload)))
  return `${encodedPayload}.${base64UrlEncode(signature)}`
}

export async function verifyUnsubscribeToken(token: unknown, secret: unknown, now = new Date()) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 2048 || !validSecret(secret)) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null

  try {
    const [encodedPayload, encodedSignature] = parts
    const signature = base64UrlDecode(encodedSignature)
    const key = await importKey(secret)
    const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(encodedPayload))
    if (!valid) return null
    const payload = validatePayload(JSON.parse(decoder.decode(base64UrlDecode(encodedPayload))))
    if (!payload) return null
    if (payload.exp < Math.floor(now.getTime() / 1000)) return null
    return payload
  } catch {
    return null
  }
}
