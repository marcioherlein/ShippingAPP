export type EmailMessage = {
  from: string
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string | null
}

export type EmailSendResult = { messageId: string }

export interface EmailProvider {
  readonly name: string
  readonly configured: boolean
  send(message: EmailMessage, options: { idempotencyKey: string }): Promise<EmailSendResult>
}

export class EmailProviderError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) {
    super(code)
    this.name = 'EmailProviderError'
  }
}

type FetchLike = typeof fetch

type ResendOptions = {
  apiKey?: string | null
  fetchImpl?: FetchLike
  timeoutMs?: number
}

function safeHeader(value: string, label: string, max: number) {
  const normalized = value.trim()
  if (!normalized || normalized.length > max || /[\r\n]/.test(normalized)) {
    throw new EmailProviderError(`invalid_${label}`, false)
  }
  return normalized
}

function safeIdempotencyKey(value: string) {
  const normalized = value.trim()
  if (!normalized || normalized.length > 256 || /[\r\n]/.test(normalized)) {
    throw new EmailProviderError('invalid_idempotency_key', false)
  }
  return normalized
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend'
  readonly configured: boolean
  private readonly apiKey: string | null
  private readonly fetchImpl: FetchLike
  private readonly timeoutMs: number

  constructor(options: ResendOptions = {}) {
    this.apiKey = typeof options.apiKey === 'string' && options.apiKey.trim() ? options.apiKey.trim() : null
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = Math.max(1000, Math.min(options.timeoutMs ?? 10000, 30000))
    this.configured = Boolean(this.apiKey)
  }

  async send(message: EmailMessage, options: { idempotencyKey: string }): Promise<EmailSendResult> {
    if (!this.apiKey) throw new EmailProviderError('email_provider_not_configured', false)

    const from = safeHeader(message.from, 'from', 320)
    const to = safeHeader(message.to, 'recipient', 320)
    const subject = safeHeader(message.subject, 'subject', 998)
    const replyTo = message.replyTo ? safeHeader(message.replyTo, 'reply_to', 320) : null
    const idempotencyKey = safeIdempotencyKey(options.idempotencyKey)
    if (message.html.length > 1_000_000 || message.text.length > 1_000_000) {
      throw new EmailProviderError('email_payload_too_large', false)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    let response: Response
    try {
      response = await this.fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          html: message.html,
          text: message.text,
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof EmailProviderError) throw error
      if (controller.signal.aborted) throw new EmailProviderError('email_provider_timeout', true)
      throw new EmailProviderError('email_provider_unavailable', true)
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      if (response.status === 409 || response.status === 429 || response.status >= 500) {
        throw new EmailProviderError('email_provider_temporarily_unavailable', true)
      }
      throw new EmailProviderError('email_provider_rejected', false)
    }

    let body: unknown
    try { body = await response.json() } catch {
      throw new EmailProviderError('email_provider_invalid_response', true)
    }
    const messageId = body && typeof body === 'object' && typeof (body as any).id === 'string'
      ? (body as any).id.trim()
      : ''
    if (!messageId || messageId.length > 191) throw new EmailProviderError('email_provider_invalid_response', true)
    return { messageId }
  }
}

export function createEmailProvider(env: Record<string, unknown>, dependencies: { fetchImpl?: FetchLike } = {}) {
  return new ResendEmailProvider({
    apiKey: typeof env.RESEND_API_KEY === 'string' ? env.RESEND_API_KEY : null,
    fetchImpl: dependencies.fetchImpl,
  })
}
