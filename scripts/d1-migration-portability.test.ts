import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('migrations/0003_usage_entitlements.sql', 'utf8')
const withoutLineComments = migration.replace(/^\s*--.*$/gm, '')

const triggerNames = [
  'trg_credit_reservations_before_insert',
  'trg_credit_reservations_after_insert',
  'trg_credit_reservations_before_update_identity',
  'trg_credit_reservations_before_update_transition',
  'trg_credit_reservations_after_retry',
  'trg_credit_reservations_after_release',
]

describe('Stage 5 D1 remote migration portability', () => {
  it('uses parser-safe parenthesized CASE expressions and LF endings', () => {
    // Cloudflare D1 remote migration parsing has historically split trigger
    // bodies incorrectly around unparenthesized CASE/END and CRLF input.
    expect(migration.includes('\r\n')).toBe(false)
    expect(withoutLineComments).not.toMatch(/SELECT\s+CASE\b/i)
    expect((withoutLineComments.match(/SELECT\s*\(CASE\b/gi) || []).length).toBe(2)
  })

  it('is safe to retry after a remote parser failure', () => {
    expect(withoutLineComments).toMatch(/CREATE TABLE IF NOT EXISTS credit_reservations/i)
    expect(withoutLineComments).toMatch(/CREATE INDEX IF NOT EXISTS idx_credit_reservations_user_status/i)
    expect(withoutLineComments).toMatch(/CREATE INDEX IF NOT EXISTS idx_credit_reservations_lease/i)
    for (const name of triggerNames) {
      expect(withoutLineComments).toMatch(new RegExp(`CREATE TRIGGER IF NOT EXISTS ${name}`, 'i'))
    }
  })
})
