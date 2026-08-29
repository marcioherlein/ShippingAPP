import { describe, expect, it, vi } from 'vitest'
import {
  authorizeRequest,
  INTERNAL_TOKEN_HEADER,
  TRUSTED_AUTH_KIND_HEADER,
  TRUSTED_AUTH_SUBJECT_HEADER,
  TRUSTED_USER_ID_HEADER,
} from './auth'
import type { D1DatabaseLike } from './persistence/d1'

const fakeDb: D1DatabaseLike = {
  prepare() {
    throw new Error('Unexpected database call in auth test')
  },
}

function env(overrides: Record<string, unknown> = {}) {
  return {
    AUTH_ENFORCEMENT: 'true',
    CLERK_SECRET_KEY: 'sk_test_placeholder',
    CLERK_PUBLISHABLE_KEY: 'pk_test_placeholder',
    CLERK_JWT_KEY: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----',
    INTERNAL_API_TOKEN: 'i'.repeat(48),
    DB: fakeDb,
    ...overrides,
  }
}

const ensureUser = vi.fn(async (_db: D1DatabaseLike, input: { id: string; provider: string; subject: string }) => ({
  id: `db-${input.subject}`,
}))

describe('Stage 2 auth gate', () => {
  it('leaves public routes accessible while stripping caller-forged trusted identity headers', async () => {
    const request = new Request('https://shippingapp.test/api/image-proxy?url=https://example.com/a.png', {
      headers: {
        [TRUSTED_USER_ID_HEADER]: 'victim-id',
        [TRUSTED_AUTH_SUBJECT_HEADER]: 'victim-subject',
        [TRUSTED_AUTH_KIND_HEADER]: 'user',
      },
    })
    const result = await authorizeRequest(request, env())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.request.headers.get(TRUSTED_USER_ID_HEADER)).toBeNull()
    expect(result.request.headers.get(TRUSTED_AUTH_SUBJECT_HEADER)).toBeNull()
    expect(result.request.headers.get(TRUSTED_AUTH_KIND_HEADER)).toBeNull()
  })

  it('rejects a protected route when the session is missing', async () => {
    const result = await authorizeRequest(
      new Request('https://shippingapp.test/api/analyze', { method: 'POST' }),
      env(),
      { verifySession: async () => null, ensureUser },
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(401)
  })

  it('rejects a forged or expired session when verification throws', async () => {
    const result = await authorizeRequest(
      new Request('https://shippingapp.test/api/ncm-classify', { method: 'POST', headers: { authorization: 'Bearer forged.jwt.value' } }),
      env(),
      { verifySession: async () => { throw new Error('invalid signature or expired') }, ensureUser },
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(401)
    expect(await result.response.json()).toEqual({ error: 'Unauthorized.', code: 'unauthorized' })
  })

  it('derives trusted tenant identity from the verified session and ignores caller-supplied user ids', async () => {
    const request = new Request('https://shippingapp.test/api/intake', {
      method: 'POST',
      headers: {
        [TRUSTED_USER_ID_HEADER]: 'victim-db-id',
        [TRUSTED_AUTH_SUBJECT_HEADER]: 'victim-clerk-id',
        [TRUSTED_AUTH_KIND_HEADER]: 'user',
      },
      body: JSON.stringify({ userId: 'victim-db-id', message: 'test' }),
    })
    const result = await authorizeRequest(request, env(), {
      verifySession: async () => ({ subject: 'clerk-attacker' }),
      ensureUser,
      randomId: () => 'new-id',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.identity).toEqual({ kind: 'user', provider: 'clerk', subject: 'clerk-attacker', userId: 'db-clerk-attacker' })
    expect(result.request.headers.get(TRUSTED_USER_ID_HEADER)).toBe('db-clerk-attacker')
    expect(result.request.headers.get(TRUSTED_AUTH_SUBJECT_HEADER)).toBe('clerk-attacker')
    expect(result.request.headers.get(TRUSTED_AUTH_KIND_HEADER)).toBe('user')
  })

  it('fails closed when auth enforcement is enabled without Clerk configuration', async () => {
    const result = await authorizeRequest(
      new Request('https://shippingapp.test/api/analyze', { method: 'POST' }),
      env({ CLERK_SECRET_KEY: undefined }),
      { verifySession: async () => ({ subject: 'should-not-run' }), ensureUser },
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(503)
    expect((await result.response.json() as any).code).toBe('auth_not_configured')
  })

  it('protects internal high-cost routes with a separate server-only token', async () => {
    const denied = await authorizeRequest(
      new Request('https://shippingapp.test/api/alibaba-native-probe', { method: 'POST', headers: { [INTERNAL_TOKEN_HEADER]: 'wrong'.repeat(10) } }),
      env(),
    )
    expect(denied.ok).toBe(false)
    if (!denied.ok) expect(denied.response.status).toBe(401)

    const allowed = await authorizeRequest(
      new Request('https://shippingapp.test/api/alibaba-native-probe', { method: 'POST', headers: { [INTERNAL_TOKEN_HEADER]: 'i'.repeat(48) } }),
      env(),
    )
    expect(allowed.ok).toBe(true)
    if (allowed.ok) expect(allowed.identity).toEqual({ kind: 'service' })
  })

  it('allows the service credential to run CI smokes on customer routes but never to impersonate /api/me', async () => {
    const service = await authorizeRequest(
      new Request('https://shippingapp.test/api/opportunity-search', { method: 'POST', headers: { [INTERNAL_TOKEN_HEADER]: 'i'.repeat(48) } }),
      env(),
    )
    expect(service.ok).toBe(true)
    if (service.ok) expect(service.request.headers.get(TRUSTED_AUTH_KIND_HEADER)).toBe('service')

    const me = await authorizeRequest(
      new Request('https://shippingapp.test/api/me', { headers: { [INTERNAL_TOKEN_HEADER]: 'i'.repeat(48) } }),
      env(),
      { verifySession: async () => null, ensureUser },
    )
    expect(me.ok).toBe(false)
    if (!me.ok) expect(me.response.status).toBe(401)
  })

  it('keeps rollout disabled unless explicitly enabled and still strips spoofed trusted headers', async () => {
    const result = await authorizeRequest(
      new Request('https://shippingapp.test/api/analyze', { method: 'POST', headers: { [TRUSTED_USER_ID_HEADER]: 'spoofed' } }),
      env({ AUTH_ENFORCEMENT: 'false' }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.request.headers.get(TRUSTED_USER_ID_HEADER)).toBeNull()
  })
})
