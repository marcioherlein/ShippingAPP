import { describe, expect, it } from 'vitest'
import { EXPECTED_DIGEST_RECIPIENT_COLUMNS, validateDigestRecipientColumns } from './digest-schema-privacy.mjs'

describe('Stage 7 digest scheduler persistence privacy', () => {
  it('allows the opaque email_events foreign-key reference without storing an address or message', () => {
    expect(() => validateDigestRecipientColumns(EXPECTED_DIGEST_RECIPIENT_COLUMNS)).not.toThrow()
    expect(EXPECTED_DIGEST_RECIPIENT_COLUMNS).toContain('email_event_id')
  })

  it.each([
    'recipient_email',
    'email_body',
    'subject',
    'html',
    'text',
    'message_body',
    'product_title',
    'recipient_address',
  ])('rejects unexpected persisted content column %s', (column) => {
    expect(() => validateDigestRecipientColumns([...EXPECTED_DIGEST_RECIPIENT_COLUMNS, column])).toThrow(/unexpected columns/)
  })

  it('rejects removal or renaming of the expected ownership/audit columns too', () => {
    expect(() => validateDigestRecipientColumns(EXPECTED_DIGEST_RECIPIENT_COLUMNS.filter((column) => column !== 'user_id'))).toThrow(/unexpected columns/)
    expect(() => validateDigestRecipientColumns(EXPECTED_DIGEST_RECIPIENT_COLUMNS.map((column) => column === 'email_event_id' ? 'event_id' : column))).toThrow(/unexpected columns/)
  })
})
