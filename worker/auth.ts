import { createClerkClient } from '@clerk/backend'
import { ensureAuthUser } from './authUser'
import type { D1DatabaseLike } from './persistence/d1'
import { resolveRoutePolicy } from './routePolicy'

export const TRUSTED_USER_ID_HEADER = 'x-shippingapp-user-id'
export const TRUSTED_AUTH_SUBJECT_HEADER = 'x-shippingapp-auth-subject'
export const TRUSTED_AUTH_KIND_HEADER = 'x-shippingapp-auth-kind'
export const INTERNAL_TOKEN_HEADER = 'x-shippingapp-internal-token'

const DEFAULT_AUTHORIZED_PARTIES = [
  'http://localhost:5173',
  'https://shippingapp.marciofabrizio.workers.dev',
] as const

type EnvLike = Record<string, unknown> & { DB?: D1DatabaseLike }

export type VerifiedSession = { subject: string }
export type AuthIdentity = {
  kind: 'user'
  provider: 'clerk'
  subject: string
  userId: string
} | {
  kind: 'service'
}

export type AuthGateResult =
  | { ok: true; request: Request; identity: AuthIdentity | null }
  | { ok: false; response: Response }

export type AuthDependencies = {
  verifySession?: (request: Request, env: EnvLike) => Promise<VerifiedSession | null>
  ensureUser?: (db: D1DatabaseLike, input: { id: string; provider: string; subject: string }) => Promise<{ id: string }>
  randomId?: () => string
}

function textEnv(env: EnvLike, key: string) {
  const value = env[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function authEnforcementEnabled(env: EnvLike) {
  return textEnv(env, 'AUTH_ENFORCEMENT') === 'true'
}

function jsonError(status: number, code: string, error: string) {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function sanitizedRequest(request: Request) {
  const headers = new Headers(request.headers)
  headers.delete(TRUSTED_USER_ID_HEADER)
  headers.delete(TRUSTED_AUTH_SUBJECT_HEADER)
  headers.delete(TRUSTED_AUTH_KIND_HEADER)
  headers.delete(INTERNAL_TOKEN_HEADER)
  return new Request(request, { headers })
}

function withTrustedIdentity(request: Request, identity: AuthIdentity) {
  const headers = new Headers(request.headers)
  headers.delete(TRUSTED_USER_ID_HEADER)
  headers.delete(TRUSTED_AUTH_SUBJECT_HEADER)
  headers.delete(TRUSTED_AUTH_KIND_HEADER)
  headers.delete(INTERNAL_TOKEN_HEADER)
  headers.set(TRUSTED_AUTH_KIND_HEADER, identity.kind)
  if (identity.kind === 'user') {
    headers.set(TRUSTED_USER_ID_HEADER, identity.userId)
    headers.set(TRUSTED_AUTH_SUBJECT_HEADER, identity.subject)
  }
  return new Request(request, { headers })
}

function constantTimeTextEqual(left: string, right: string) {
  const max = Math.max(left.length, right.length)
  let diff = left.length ^ right.length
  for (let index = 0; index < max; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return diff === 0
}

function hasValidInternalToken(request: Request, env: EnvLike) {
  const configured = textEnv(env, 'INTERNAL_API_TOKEN')
  if (!configured || configured.length < 32) return false
  const supplied = request.headers.get(INTERNAL_TOKEN_HEADER) || ''
  return supplied.length >= 32 && constantTimeTextEqual(supplied, configured)
}

function authorizedParties(env: EnvLike) {
  const configured = textEnv(env, 'CLERK_AUTHORIZED_PARTIES')
  if (!configured) return [...DEFAULT_AUTHORIZED_PARTIES]
  return configured.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 12)
}

export async function verifyClerkSession(request: Request, env: EnvLike): Promise<VerifiedSession | null> {
  const secretKey = textEnv(env, 'CLERK_SECRET_KEY')
  const publishableKey = textEnv(env, 'CLERK_PUBLISHABLE_KEY')
  const jwtKey = textEnv(env, 'CLERK_JWT_KEY')
  if (!secretKey || !publishableKey || !jwtKey) {
    throw new Error('Clerk authentication is not configured.')
  }

  const clerk = createClerkClient({ secretKey, publishableKey })
  const state = await clerk.authenticateRequest(request, {
    acceptsToken: 'session_token',
    authorizedParties: authorizedParties(env),
    jwtKey,
  })
  if (!state.isAuthenticated) return null
  const auth = state.toAuth()
  return typeof auth.userId === 'string' && auth.userId ? { subject: auth.userId } : null
}

export async function authorizeRequest(
  incomingRequest: Request,
  env: EnvLike,
  dependencies: AuthDependencies = {},
): Promise<AuthGateResult> {
  const request = sanitizedRequest(incomingRequest)
  const url = new URL(request.url)
  const policy = resolveRoutePolicy(url.pathname, request.method)

  if (!policy || !['authenticated', 'internal'].includes(policy.targetAccess)) {
    return { ok: true, request, identity: null }
  }

  if (!authEnforcementEnabled(env)) {
    return { ok: true, request, identity: null }
  }

  const serviceAuthenticated = hasValidInternalToken(incomingRequest, env)
  if (policy.targetAccess === 'internal') {
    if (!textEnv(env, 'INTERNAL_API_TOKEN')) {
      return { ok: false, response: jsonError(503, 'internal_auth_not_configured', 'Operational authentication is not configured.') }
    }
    return serviceAuthenticated
      ? { ok: true, request: withTrustedIdentity(request, { kind: 'service' }), identity: { kind: 'service' } }
      : { ok: false, response: jsonError(401, 'unauthorized', 'Unauthorized.') }
  }

  // CI/operations may exercise customer routes with a server-only credential, but
  // /api/me intentionally proves a real user session and never accepts that bypass.
  if (serviceAuthenticated && policy.id !== 'me') {
    return { ok: true, request: withTrustedIdentity(request, { kind: 'service' }), identity: { kind: 'service' } }
  }

  if (!textEnv(env, 'CLERK_SECRET_KEY') || !textEnv(env, 'CLERK_PUBLISHABLE_KEY') || !textEnv(env, 'CLERK_JWT_KEY')) {
    return { ok: false, response: jsonError(503, 'auth_not_configured', 'Authentication is not configured.') }
  }
  if (!env.DB) {
    return { ok: false, response: jsonError(503, 'auth_store_not_configured', 'Authentication storage is not configured.') }
  }

  const verify = dependencies.verifySession ?? verifyClerkSession
  let verified: VerifiedSession | null
  try {
    verified = await verify(incomingRequest, env)
  } catch {
    return { ok: false, response: jsonError(401, 'unauthorized', 'Unauthorized.') }
  }
  if (!verified?.subject) {
    return { ok: false, response: jsonError(401, 'unauthorized', 'Unauthorized.') }
  }

  const ensure = dependencies.ensureUser ?? ((db, input) => ensureAuthUser(db, input))
  let user: { id: string }
  try {
    user = await ensure(env.DB, {
      id: (dependencies.randomId ?? (() => crypto.randomUUID()))(),
      provider: 'clerk',
      subject: verified.subject,
    })
  } catch {
    return { ok: false, response: jsonError(503, 'auth_identity_unavailable', 'Authentication identity is temporarily unavailable.') }
  }

  const identity: AuthIdentity = { kind: 'user', provider: 'clerk', subject: verified.subject, userId: user.id }
  return { ok: true, request: withTrustedIdentity(request, identity), identity }
}

export function readTrustedUserId(request: Request) {
  return request.headers.get(TRUSTED_AUTH_KIND_HEADER) === 'user'
    ? request.headers.get(TRUSTED_USER_ID_HEADER)
    : null
}
