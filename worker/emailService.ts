import { createEmailProvider, EmailProviderError, type EmailProvider } from './emailProvider'
import { emailPreferenceScopeForTemplate, renderApplicationEmail, type EmailPreferenceScope, type EmailTemplateInput, type EmailTemplateKey } from './emailTemplates'
import { EmailRepository, parseEmailEventMetadata } from './persistence/emailRepository'
import type { D1DatabaseLike } from './persistence/d1'
import { createUnsubscribeToken, type UnsubscribeScope } from './unsubscribeToken'

type EmailEnv = Record<string, unknown> & { DB?: D1DatabaseLike }

type EmailServiceDependencies = {
  provider?: EmailProvider
  clock?: () => Date
  randomId?: () => string
}

export type SendApplicationEmailInput = {
  userId: string
  templateKey: EmailTemplateKey
  templateInput?: EmailTemplateInput
  idempotencyKey: string
}

export type SendApplicationEmailResult = {
  status: 'sent' | 'suppressed' | 'failed' | 'not_configured' | 'queued'
  replayed: boolean
  eventId?: string
  providerMessageId?: string | null
  code?: string
}

function textEnv(env: EmailEnv, key: string, max = 320) {
  const value = env[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && trimmed.length <= max && !/[\r\n]/.test(trimmed) ? trimmed : null
}

function validEmail(value: unknown) {
  if (typeof value !== 'string' || value.length > 320 || /[\r\n]/.test(value)) return null
  const normalized = value.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null
}

function validIdempotencyKey(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length >= 8 && normalized.length <= 180 && !/[\r\n]/.test(normalized) ? normalized : null
}

function branding(env: EmailEnv) {
  return {
    appName: textEnv(env, 'EMAIL_APP_NAME', 80) ?? 'ShippingAPP',
    supportEmail: validEmail(textEnv(env, 'EMAIL_SUPPORT_EMAIL') ?? ''),
  }
}

function fromAddress(env: EmailEnv) {
  return textEnv(env, 'EMAIL_FROM')
}

function emailSendingEnabled(env: EmailEnv) {
  return textEnv(env, 'EMAIL_SENDING_ENABLED', 5) === 'true'
}

function preferencesAllow(scope: EmailPreferenceScope, row: { digest_enabled: number; alerts_enabled: number; marketing_enabled: number }) {
  if (scope === 'transactional') return true
  if (scope === 'digest') return row.digest_enabled === 1
  if (scope === 'alerts') return row.alerts_enabled === 1
  return row.marketing_enabled === 1
}

function appOrigin(env: EmailEnv) {
  const configured = textEnv(env, 'EMAIL_PUBLIC_BASE_URL', 2048)
  if (!configured) return null
  try {
    const parsed = new URL(configured)
    if (parsed.protocol === 'https:' || parsed.hostname === 'localhost') return parsed.origin
  } catch {
    // Invalid server-owned configuration fails closed.
  }
  return null
}

async function unsubscribeUrl(env: EmailEnv, userId: string, scope: Exclude<EmailPreferenceScope, 'transactional'>, clock: () => Date) {
  const secret = textEnv(env, 'EMAIL_UNSUBSCRIBE_SECRET', 512)
  const base = appOrigin(env)
  if (!secret || secret.length < 32 || !base) return null
  const expiresAt = new Date(clock().getTime() + 365 * 24 * 60 * 60 * 1000)
  const token = await createUnsubscribeToken({ userId, scope: scope as UnsubscribeScope, secret, expiresAt })
  return `${base}/api/email-unsubscribe?token=${encodeURIComponent(token)}`
}

function sanitizedResult(row: { id: string; status: string; provider_message_id: string | null }, replayed: boolean): SendApplicationEmailResult {
  if (row.status === 'sent' || row.status === 'delivered') {
    return { status: 'sent', replayed, eventId: row.id, providerMessageId: row.provider_message_id }
  }
  if (row.status === 'suppressed') return { status: 'suppressed', replayed, eventId: row.id }
  if (row.status === 'failed') return { status: 'failed', replayed, eventId: row.id }
  return { status: 'queued', replayed, eventId: row.id }
}

function collision(existing: Awaited<ReturnType<EmailRepository['getEventByIdempotency']>>, input: {
  userId: string
  recipient: string
  templateKey: EmailTemplateKey
  scope: EmailPreferenceScope
}) {
  if (!existing) return false
  const metadata = parseEmailEventMetadata(existing)
  return existing.user_id !== input.userId
    || existing.recipient !== input.recipient
    || metadata?.templateKey !== input.templateKey
    || metadata?.scope !== input.scope
}

export async function sendApplicationEmail(
  env: EmailEnv,
  input: SendApplicationEmailInput,
  dependencies: EmailServiceDependencies = {},
): Promise<SendApplicationEmailResult> {
  if (!env.DB) return { status: 'not_configured', replayed: false, code: 'email_store_not_configured' }
  if (typeof input.userId !== 'string' || !input.userId || input.userId.length > 64) {
    return { status: 'failed', replayed: false, code: 'invalid_user' }
  }
  const key = validIdempotencyKey(input.idempotencyKey)
  if (!key) return { status: 'failed', replayed: false, code: 'invalid_idempotency_key' }
  if (!emailSendingEnabled(env)) {
    return { status: 'not_configured', replayed: false, code: 'email_sending_disabled' }
  }

  const clock = dependencies.clock ?? (() => new Date())
  const repo = new EmailRepository(env.DB, clock)
  const preference = await repo.getOrCreatePreferences(input.userId)
  const recipientRow = await repo.getUserEmail(input.userId)
  const recipient = validEmail(recipientRow?.email)
  if (!recipient) return { status: 'not_configured', replayed: false, code: 'recipient_email_unavailable' }

  const scope = emailPreferenceScopeForTemplate(input.templateKey)
  const metadata = { templateKey: input.templateKey, scope } as const
  const existing = await repo.getEventByIdempotency(key)
  if (collision(existing, { userId: input.userId, recipient, templateKey: input.templateKey, scope })) {
    return { status: 'failed', replayed: true, eventId: existing?.id, code: 'email_idempotency_collision' }
  }
  if (existing && ['sent', 'delivered', 'suppressed'].includes(existing.status)) return sanitizedResult(existing, true)

  if (!preferencesAllow(scope, preference)) {
    if (existing) {
      const suppressed = await repo.markSuppressed(existing.id, { ...metadata, suppressedReason: 'preference_disabled' })
      return suppressed ? sanitizedResult(suppressed, true) : { status: 'suppressed', replayed: true, eventId: existing.id }
    }
    const reserved = await repo.reserveEvent({
      id: (dependencies.randomId ?? (() => crypto.randomUUID()))(),
      userId: input.userId,
      eventType: input.templateKey,
      recipient,
      idempotencyKey: key,
      metadata,
    })
    const suppressed = await repo.markSuppressed(reserved.event.id, { ...metadata, suppressedReason: 'preference_disabled' })
    return suppressed ? sanitizedResult(suppressed, !reserved.created) : { status: 'suppressed', replayed: !reserved.created, eventId: reserved.event.id }
  }

  const sender = fromAddress(env)
  if (!sender) return { status: 'not_configured', replayed: Boolean(existing), eventId: existing?.id, code: 'email_sender_not_configured' }

  const provider = dependencies.provider ?? createEmailProvider(env)
  if (!provider.configured) return { status: 'not_configured', replayed: Boolean(existing), eventId: existing?.id, code: 'email_provider_not_configured' }

  let unsubscribe: string | null = null
  if (scope !== 'transactional') {
    unsubscribe = await unsubscribeUrl(env, input.userId, scope, clock)
    if (!unsubscribe) return { status: 'not_configured', replayed: Boolean(existing), eventId: existing?.id, code: 'unsubscribe_not_configured' }
  }

  const rendered = renderApplicationEmail(input.templateKey, {
    ...(input.templateInput ?? {}),
    displayName: input.templateInput?.displayName ?? recipientRow?.display_name ?? null,
    unsubscribeUrl: unsubscribe,
  }, branding(env))

  const reserved = existing
    ? { event: existing, created: false }
    : await repo.reserveEvent({
        id: (dependencies.randomId ?? (() => crypto.randomUUID()))(),
        userId: input.userId,
        eventType: input.templateKey,
        recipient,
        idempotencyKey: key,
        metadata,
      })

  if (!reserved.created && reserved.event.status === 'queued') {
    const ageMs = clock().getTime() - Date.parse(reserved.event.created_at)
    if (!Number.isFinite(ageMs) || ageMs < 120_000) return { status: 'queued', replayed: true, eventId: reserved.event.id }
  }
  if (!reserved.created && reserved.event.status === 'failed') {
    const ageMs = clock().getTime() - Date.parse(reserved.event.created_at)
    if (!Number.isFinite(ageMs) || ageMs > 23 * 60 * 60 * 1000) {
      return { status: 'failed', replayed: true, eventId: reserved.event.id, code: 'email_retry_window_expired' }
    }
  }

  let sent: Awaited<ReturnType<EmailProvider['send']>>
  try {
    sent = await provider.send({
      from: sender,
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: validEmail(textEnv(env, 'EMAIL_REPLY_TO') ?? ''),
    }, { idempotencyKey: `shippingapp/${key}` })
  } catch (error) {
    const code = error instanceof EmailProviderError ? error.code : 'email_provider_unavailable'
    try {
      await repo.markFailed(reserved.event.id, provider.name, { ...metadata, failureCode: code })
    } catch {
      // Provider failure is authoritative. A secondary persistence failure must
      // not leak raw D1 errors or change the delivery outcome reported upstream.
    }
    return { status: 'failed', replayed: !reserved.created, eventId: reserved.event.id, code }
  }

  try {
    const updated = await repo.markSent(reserved.event.id, provider.name, sent.messageId, metadata)
    if (updated) return sanitizedResult(updated, !reserved.created)
  } catch {
    // The provider already accepted this idempotent send. Never mark the event
    // failed solely because D1 could not persist the acknowledgement: that would
    // invite an unsafe duplicate retry. Keep the reservation queued/ambiguous;
    // later retries reuse the exact same provider idempotency key.
  }

  return {
    status: 'queued',
    replayed: !reserved.created,
    eventId: reserved.event.id,
    code: 'email_delivery_state_unconfirmed',
  }
}

export function emailRuntimeStatus(env: EmailEnv) {
  const provider = createEmailProvider(env)
  const unsubscribeSecret = textEnv(env, 'EMAIL_UNSUBSCRIBE_SECRET', 512)
  return {
    provider: provider.name,
    sendingEnabled: emailSendingEnabled(env),
    providerConfigured: provider.configured,
    senderConfigured: Boolean(fromAddress(env)),
    unsubscribeConfigured: Boolean(unsubscribeSecret && unsubscribeSecret.length >= 32 && appOrigin(env)),
    appName: branding(env).appName,
    templates: ['welcome', 'usage', 'weekly_digest', 'alert', 'billing'] as EmailTemplateKey[],
  }
}
