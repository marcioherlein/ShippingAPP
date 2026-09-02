import { emailRuntimeStatus } from './emailService'

export type ProductionIdentityStatus = {
  appName: string
  publicBaseUrl: string | null
  publicOrigin: string | null
  publicHost: string | null
  finalDomainConfigured: boolean
  authorizedParties: string[]
  authPartyIncludesPublicOrigin: boolean
  providerConfigured: boolean
  senderConfigured: boolean
  replyToConfigured: boolean
  supportConfigured: boolean
  unsubscribeConfigured: boolean
  senderDomain: string | null
  replyToDomain: string | null
  supportDomain: string | null
  senderDomainAligned: boolean
  replyToDomainAligned: boolean
  supportDomainAligned: boolean
  sendingEnabled: boolean
  configurationReady: boolean
  activationBlocked: boolean
  blockers: string[]
}

function text(env: Record<string, unknown>, key: string, max = 2048) {
  const value = env[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && trimmed.length <= max && !/[\r\n]/.test(trimmed) ? trimmed : null
}

function httpsOrigin(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    if (url.username || url.password || url.search || url.hash) return null
    return url.origin
  } catch {
    return null
  }
}

function mailboxAddress(value: string | null) {
  if (!value || /[\r\n]/.test(value)) return null
  const trimmed = value.trim()
  const angle = trimmed.match(/<([^<>]+)>$/)
  const raw = (angle?.[1] ?? trimmed).trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : null
}

function domainOfMailbox(value: string | null) {
  const address = mailboxAddress(value)
  return address ? address.slice(address.lastIndexOf('@') + 1) : null
}

function normalizedHost(value: string | null) {
  if (!value) return null
  return value.toLowerCase().replace(/^\.+|\.+$/g, '') || null
}

function isSubdomainOrEqual(candidate: string | null, base: string | null) {
  const left = normalizedHost(candidate)
  const right = normalizedHost(base)
  if (!left || !right) return false
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`)
}

function finalHost(host: string | null) {
  const value = normalizedHost(host)
  if (!value) return false
  if (value === 'localhost' || value.endsWith('.localhost')) return false
  if (value.endsWith('.workers.dev')) return false
  if (value.endsWith('.pages.dev')) return false
  if (value === 'shippingapp.invalid' || value.endsWith('.invalid')) return false
  return value.includes('.')
}

function authorizedParties(env: Record<string, unknown>) {
  const configured = text(env, 'CLERK_AUTHORIZED_PARTIES', 4096)
  if (!configured) return []
  const unique = new Set<string>()
  for (const item of configured.split(',')) {
    const origin = httpsOrigin(item.trim())
    if (origin) unique.add(origin)
    else if (item.trim() === 'http://localhost:5173') unique.add(item.trim())
  }
  return [...unique].slice(0, 20)
}

export function productionIdentityStatus(env: Record<string, unknown>): ProductionIdentityStatus {
  const email = emailRuntimeStatus(env)
  const publicBaseUrl = text(env, 'EMAIL_PUBLIC_BASE_URL')
  const publicOrigin = httpsOrigin(publicBaseUrl)
  let publicHost: string | null = null
  if (publicOrigin) {
    try { publicHost = new URL(publicOrigin).hostname.toLowerCase() } catch { publicHost = null }
  }

  const senderDomain = domainOfMailbox(text(env, 'EMAIL_FROM', 320))
  const replyToDomain = domainOfMailbox(text(env, 'EMAIL_REPLY_TO', 320))
  const supportDomain = domainOfMailbox(text(env, 'EMAIL_SUPPORT_EMAIL', 320))
  const parties = authorizedParties(env)
  const authPartyIncludesPublicOrigin = Boolean(publicOrigin && parties.includes(publicOrigin))
  const finalDomainConfigured = finalHost(publicHost)
  const senderDomainAligned = isSubdomainOrEqual(senderDomain, publicHost)
  const replyToDomainAligned = isSubdomainOrEqual(replyToDomain, publicHost)
  const supportDomainAligned = isSubdomainOrEqual(supportDomain, publicHost)
  const replyToConfigured = Boolean(replyToDomain)
  const supportConfigured = Boolean(supportDomain)

  const blockers: string[] = []
  if (!finalDomainConfigured) blockers.push('final_public_domain_required')
  if (!authPartyIncludesPublicOrigin) blockers.push('authorized_party_missing_public_origin')
  if (!email.providerConfigured) blockers.push('email_provider_not_configured')
  if (!email.senderConfigured) blockers.push('email_sender_not_configured')
  if (!replyToConfigured) blockers.push('email_reply_to_not_configured')
  if (!supportConfigured) blockers.push('email_support_not_configured')
  if (!email.unsubscribeConfigured) blockers.push('unsubscribe_not_configured')
  if (email.senderConfigured && !senderDomainAligned) blockers.push('sender_domain_not_aligned')
  if (replyToConfigured && !replyToDomainAligned) blockers.push('reply_to_domain_not_aligned')
  if (supportConfigured && !supportDomainAligned) blockers.push('support_domain_not_aligned')

  const configurationReady = blockers.length === 0
  // DNS/provider-delivery verification is intentionally external to the Worker.
  // Sending may only be enabled after the Stage 8 production gate proves those
  // external controls; runtime configuration alone is never enough authority.
  const activationBlocked = !configurationReady || !email.sendingEnabled

  return {
    appName: email.appName,
    publicBaseUrl,
    publicOrigin,
    publicHost,
    finalDomainConfigured,
    authorizedParties: parties,
    authPartyIncludesPublicOrigin,
    providerConfigured: email.providerConfigured,
    senderConfigured: email.senderConfigured,
    replyToConfigured,
    supportConfigured,
    unsubscribeConfigured: email.unsubscribeConfigured,
    senderDomain,
    replyToDomain,
    supportDomain,
    senderDomainAligned,
    replyToDomainAligned,
    supportDomainAligned,
    sendingEnabled: email.sendingEnabled,
    configurationReady,
    activationBlocked,
    blockers,
  }
}
