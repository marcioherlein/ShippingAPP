import { createClerkClient } from '@clerk/backend'
import type { D1DatabaseLike } from './persistence/d1'

type Env = Record<string, unknown> & { DB?: D1DatabaseLike }

type ClerkEmail = {
  id?: string | null
  emailAddress?: string | null
  verification?: { status?: string | null } | null
}
type ClerkUserLike = {
  primaryEmailAddressId?: string | null
  emailAddresses?: ClerkEmail[] | null
  firstName?: string | null
  lastName?: string | null
  username?: string | null
}

type Dependencies = {
  getUser?: (subject: string, env: Env) => Promise<ClerkUserLike>
  clock?: () => Date
}

function validEmail(value: unknown) {
  if (typeof value !== 'string' || value.length > 320 || /[\r\n]/.test(value)) return null
  const normalized = value.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null
}

function displayName(user: ClerkUserLike) {
  const parts = [user.firstName, user.lastName]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .map((value) => value.trim())
  const joined = parts.join(' ').replace(/\s+/g, ' ').slice(0, 120)
  if (joined) return joined
  if (typeof user.username === 'string') {
    const username = user.username.trim().replace(/\s+/g, ' ').slice(0, 120)
    return username || null
  }
  return null
}

export function selectClerkProfile(user: ClerkUserLike) {
  const emails = Array.isArray(user.emailAddresses) ? user.emailAddresses : []
  const primaryId = typeof user.primaryEmailAddressId === 'string' ? user.primaryEmailAddressId : ''
  const primary = primaryId ? emails.find((entry) => entry?.id === primaryId) : null
  const verifiedPrimary = primary?.verification?.status === 'verified' ? primary : null
  return {
    email: validEmail(verifiedPrimary?.emailAddress),
    displayName: displayName(user),
  }
}

async function defaultGetUser(subject: string, env: Env) {
  const secretKey = typeof env.CLERK_SECRET_KEY === 'string' ? env.CLERK_SECRET_KEY.trim() : ''
  if (!secretKey) throw new Error('clerk_profile_not_configured')
  return createClerkClient({ secretKey }).users.getUser(subject) as Promise<ClerkUserLike>
}

export async function syncClerkProfile(
  env: Env,
  input: { userId: string; subject: string },
  dependencies: Dependencies = {},
) {
  if (!env.DB) return { synced: false, emailReady: false }
  const getUser = dependencies.getUser ?? defaultGetUser
  let external: ClerkUserLike
  try { external = await getUser(input.subject, env) } catch { return { synced: false, emailReady: false } }
  const profile = selectClerkProfile(external)
  if (!profile.email) return { synced: false, emailReady: false }
  const now = (dependencies.clock ?? (() => new Date()))().toISOString()
  const result = await env.DB.prepare(
    `UPDATE users
     SET email = ?, display_name = ?, updated_at = ?
     WHERE id = ? AND auth_provider = 'clerk' AND auth_subject = ?`,
  ).bind(profile.email, profile.displayName, now, input.userId, input.subject).run()
  return { synced: Number(result.meta?.changes ?? 0) === 1, emailReady: true }
}
