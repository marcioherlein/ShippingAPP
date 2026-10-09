import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyClerkSession } from './auth'

// Exercise the real Clerk verifier with a local signing key, not a mocked SDK.
// This proves origin/expiration handling; it is not a real production account.
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
const env = {
  CLERK_SECRET_KEY: 'sk_test_local_verification',
  CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from('clerk.globalshipping.app$').toString('base64')}`,
  CLERK_JWT_KEY: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
}
function request(origin: string, expired = false) {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'local-test' })).toString('base64url')
  const body = Buffer.from(JSON.stringify({ sub: 'user_local', sid: 'sess_local', iss: 'https://clerk.globalshipping.app', azp: origin, iat: now - 120, nbf: now - 120, exp: expired ? now - 60 : now + 120 })).toString('base64url')
  const data = `${header}.${body}`
  const token = `${data}.${sign('RSA-SHA256', Buffer.from(data), keys.privateKey).toString('base64url')}`
  return new Request(`${origin}/api/me`, { headers: { authorization: `Bearer ${token}` } })
}
describe('real Clerk session verification', () => {
  it('accepts signed sessions from both production origins', async () => {
    expect(await verifyClerkSession(request('https://globalshipping.app'), env)).toEqual({ subject: 'user_local' })
    expect(await verifyClerkSession(request('https://shippingapp.marciofabrizio.workers.dev'), env)).toEqual({ subject: 'user_local' })
  })
  it('rejects a correctly signed token from an unauthorized origin with a specific code', async () => {
    await expect(verifyClerkSession(request('https://untrusted.example'), env)).rejects.toMatchObject({ code: 'auth_origin_rejected' })
  })
  it('distinguishes expired sessions from domain configuration errors', async () => {
    await expect(verifyClerkSession(request('https://globalshipping.app', true), env)).rejects.toMatchObject({ code: 'auth_session_expired' })
  })
})
