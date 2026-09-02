export type EmailDeliveryMode = 'off' | 'canary' | 'all'

type EnvLike = Record<string, unknown>

const MAX_CANARY_USERS = 20
const MAX_USER_ID_LENGTH = 64

function text(env: EnvLike, key: string, max: number) {
  const value = env[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max || /[\r\n]/.test(trimmed)) return null
  return trimmed
}

export function emailDeliveryMode(env: EnvLike): EmailDeliveryMode {
  if (text(env, 'EMAIL_SENDING_ENABLED', 5) !== 'true') return 'off'
  const configured = text(env, 'EMAIL_DELIVERY_MODE', 16)
  return configured === 'canary' || configured === 'all' ? configured : 'off'
}

export function emailCanaryUserIds(env: EnvLike) {
  const raw = text(env, 'EMAIL_CANARY_USER_IDS', 4096)
  if (!raw) return []

  const ids = raw.split(',').map((value) => value.trim()).filter(Boolean)
  if (ids.length > MAX_CANARY_USERS) return []
  const unique = new Set<string>()
  for (const id of ids) {
    if (!id || id.length > MAX_USER_ID_LENGTH || /[\s\r\n]/.test(id)) return []
    unique.add(id)
  }
  return [...unique]
}

export function emailDeliveryAllowed(env: EnvLike, userId: string) {
  const mode = emailDeliveryMode(env)
  if (mode === 'off') return { allowed: false, mode, code: 'email_sending_disabled' as const }
  if (mode === 'all') return { allowed: true, mode, code: null }

  const ids = emailCanaryUserIds(env)
  if (!ids.length || !ids.includes(userId)) {
    return { allowed: false, mode, code: 'email_canary_recipient_required' as const }
  }
  return { allowed: true, mode, code: null }
}

export function emailDeliveryPolicyStatus(env: EnvLike) {
  const mode = emailDeliveryMode(env)
  const canaryUserCount = mode === 'canary' ? emailCanaryUserIds(env).length : 0
  const canaryConfigured = mode !== 'canary' || canaryUserCount > 0
  return {
    mode,
    generalSendingEnabled: mode === 'all',
    canaryDeliveryEnabled: mode === 'canary' && canaryConfigured,
    canaryConfigured,
    canaryUserCount,
  }
}
