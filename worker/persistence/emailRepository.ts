import type { D1DatabaseLike } from './d1'
import type { EmailPreferenceScope, EmailTemplateKey } from '../emailTemplates'

export type EmailPreferencesRow = {
  user_id: string
  digest_enabled: number
  alerts_enabled: number
  marketing_enabled: number
  timezone: string
  created_at: string
  updated_at: string
}

export type EmailEventStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'suppressed'

export type EmailEventRow = {
  id: string
  user_id: string | null
  event_type: string
  recipient: string
  provider: string | null
  provider_message_id: string | null
  idempotency_key: string
  status: EmailEventStatus
  metadata_json: string | null
  created_at: string
  sent_at: string | null
}

export type UserEmailRow = {
  id: string
  email: string | null
  display_name: string | null
}

export type EmailEventMetadata = {
  templateKey: EmailTemplateKey
  scope: EmailPreferenceScope
  failureCode?: string
  suppressedReason?: string
}

function iso(clock: () => Date) {
  return clock().toISOString()
}

function bool(value: boolean) {
  return value ? 1 : 0
}

export function parseEmailEventMetadata(row: Pick<EmailEventRow, 'metadata_json'>): EmailEventMetadata | null {
  if (!row.metadata_json) return null
  try {
    const parsed = JSON.parse(row.metadata_json)
    return parsed && typeof parsed === 'object' ? parsed as EmailEventMetadata : null
  } catch {
    return null
  }
}

export class EmailRepository {
  constructor(private readonly db: D1DatabaseLike, private readonly clock: () => Date = () => new Date()) {}

  async getOrCreatePreferences(userId: string) {
    const now = iso(this.clock)
    await this.db.prepare(
      `INSERT INTO email_preferences (user_id, digest_enabled, alerts_enabled, marketing_enabled, timezone, created_at, updated_at)
       VALUES (?, 1, 1, 0, 'UTC', ?, ?)
       ON CONFLICT(user_id) DO NOTHING`,
    ).bind(userId, now, now).run()
    const row = await this.db.prepare(
      `SELECT user_id, digest_enabled, alerts_enabled, marketing_enabled, timezone, created_at, updated_at
       FROM email_preferences WHERE user_id = ?`,
    ).bind(userId).first<EmailPreferencesRow>()
    if (!row) throw new Error('email_preferences_unavailable')
    return row
  }

  async updatePreferences(userId: string, input: {
    digestEnabled?: boolean
    alertsEnabled?: boolean
    marketingEnabled?: boolean
    timezone?: string
  }) {
    const existing = await this.getOrCreatePreferences(userId)
    const now = iso(this.clock)
    await this.db.prepare(
      `UPDATE email_preferences
       SET digest_enabled = ?, alerts_enabled = ?, marketing_enabled = ?, timezone = ?, updated_at = ?
       WHERE user_id = ?`,
    ).bind(
      bool(input.digestEnabled ?? existing.digest_enabled === 1),
      bool(input.alertsEnabled ?? existing.alerts_enabled === 1),
      bool(input.marketingEnabled ?? existing.marketing_enabled === 1),
      input.timezone ?? existing.timezone,
      now,
      userId,
    ).run()
    return this.getOrCreatePreferences(userId)
  }

  async getUserEmail(userId: string) {
    return this.db.prepare(
      'SELECT id, email, display_name FROM users WHERE id = ?',
    ).bind(userId).first<UserEmailRow>()
  }

  async reserveEvent(input: {
    id: string
    userId: string | null
    eventType: string
    recipient: string
    idempotencyKey: string
    metadata: EmailEventMetadata
  }) {
    const createdAt = iso(this.clock)
    const result = await this.db.prepare(
      `INSERT INTO email_events (
        id, user_id, event_type, recipient, provider, provider_message_id,
        idempotency_key, status, metadata_json, created_at, sent_at
      ) VALUES (?, ?, ?, ?, NULL, NULL, ?, 'queued', ?, ?, NULL)
      ON CONFLICT(idempotency_key) DO NOTHING`,
    ).bind(
      input.id,
      input.userId,
      input.eventType,
      input.recipient,
      input.idempotencyKey,
      JSON.stringify(input.metadata),
      createdAt,
    ).run()
    const event = await this.getEventByIdempotency(input.idempotencyKey)
    if (!event) throw new Error('email_event_reservation_failed')
    return { event, created: Number(result.meta?.changes ?? 0) === 1 }
  }

  async getEventByIdempotency(idempotencyKey: string) {
    return this.db.prepare(
      `SELECT id, user_id, event_type, recipient, provider, provider_message_id,
              idempotency_key, status, metadata_json, created_at, sent_at
       FROM email_events WHERE idempotency_key = ?`,
    ).bind(idempotencyKey).first<EmailEventRow>()
  }

  async markSent(eventId: string, provider: string, providerMessageId: string, metadata: EmailEventMetadata) {
    const now = iso(this.clock)
    await this.db.prepare(
      `UPDATE email_events
       SET status = 'sent', provider = ?, provider_message_id = ?, metadata_json = ?, sent_at = ?
       WHERE id = ?`,
    ).bind(provider, providerMessageId, JSON.stringify(metadata), now, eventId).run()
    return this.getEventById(eventId)
  }

  async markFailed(eventId: string, provider: string, metadata: EmailEventMetadata) {
    await this.db.prepare(
      `UPDATE email_events SET status = 'failed', provider = ?, metadata_json = ? WHERE id = ?`,
    ).bind(provider, JSON.stringify(metadata), eventId).run()
    return this.getEventById(eventId)
  }

  async markSuppressed(eventId: string, metadata: EmailEventMetadata) {
    await this.db.prepare(
      `UPDATE email_events SET status = 'suppressed', metadata_json = ? WHERE id = ?`,
    ).bind(JSON.stringify(metadata), eventId).run()
    return this.getEventById(eventId)
  }

  async getEventById(eventId: string) {
    return this.db.prepare(
      `SELECT id, user_id, event_type, recipient, provider, provider_message_id,
              idempotency_key, status, metadata_json, created_at, sent_at
       FROM email_events WHERE id = ?`,
    ).bind(eventId).first<EmailEventRow>()
  }
}
