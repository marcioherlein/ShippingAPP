import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { selectClerkProfile, syncClerkProfile } from './clerkProfile'
import type { D1DatabaseLike, D1PreparedStatementLike, D1RunResultLike, D1Value } from './persistence/d1'

class NodeStatement implements D1PreparedStatementLike {
  constructor(private readonly statement: StatementSync, private readonly values: D1Value[] = []) {}
  bind(...values: D1Value[]) { return new NodeStatement(this.statement, values) }
  async first<T>() { return (this.statement.get(...this.values as any[]) as T | undefined) ?? null }
  async all<T>() { return { results: this.statement.all(...this.values as any[]) as T[] } }
  async run(): Promise<D1RunResultLike> {
    const result = this.statement.run(...this.values as any[])
    return { success: true, meta: { changes: Number(result.changes) } }
  }
}

class NodeDatabase implements D1DatabaseLike {
  constructor(readonly raw: DatabaseSync) {}
  prepare(sql: string) { return new NodeStatement(this.raw.prepare(sql)) }
}

const USER_A = 'user-clerk-profile-a'
const USER_B = 'user-clerk-profile-b'
const NOW = '2026-09-01T12:00:00.000Z'
const verified = { status: 'verified' }

function seed(sqlite: DatabaseSync) {
  sqlite.exec(readFileSync('migrations/0001_saas_foundation.sql', 'utf8'))
  const insert = sqlite.prepare("INSERT INTO users (id, auth_provider, auth_subject, email, display_name, created_at, updated_at) VALUES (?, 'clerk', ?, ?, ?, ?, ?)")
  insert.run(USER_A, 'clerk-a', 'old-a@example.com', 'Old A', NOW, NOW)
  insert.run(USER_B, 'clerk-b', 'old-b@example.com', 'Old B', NOW, NOW)
}

describe('Stage 6 Clerk server-owned email profile sync', () => {
  let sqlite: DatabaseSync
  let db: NodeDatabase

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:')
    seed(sqlite)
    db = new NodeDatabase(sqlite)
  })

  afterEach(() => sqlite.close())

  it('selects only the declared verified primary Clerk email rather than a secondary address', () => {
    expect(selectClerkProfile({
      primaryEmailAddressId: 'primary',
      emailAddresses: [
        { id: 'secondary', emailAddress: 'secondary@example.com', verification: verified },
        { id: 'primary', emailAddress: 'primary@example.com', verification: verified },
      ],
      firstName: 'María',
      lastName: 'Pérez',
    })).toEqual({ email: 'primary@example.com', displayName: 'María Pérez' })
  })

  it('fails closed when the primary email is absent, mismatched or unverified', () => {
    expect(selectClerkProfile({
      emailAddresses: [{ id: 'secondary', emailAddress: 'secondary@example.com', verification: verified }],
    }).email).toBeNull()
    expect(selectClerkProfile({
      primaryEmailAddressId: 'missing',
      emailAddresses: [{ id: 'secondary', emailAddress: 'secondary@example.com', verification: verified }],
    }).email).toBeNull()
    expect(selectClerkProfile({
      primaryEmailAddressId: 'primary',
      emailAddresses: [{ id: 'primary', emailAddress: 'unverified@example.com', verification: { status: 'unverified' } }],
    }).email).toBeNull()
  })

  it('updates only the D1 user that matches both internal id and Clerk subject', async () => {
    const result = await syncClerkProfile({ DB: db }, { userId: USER_A, subject: 'clerk-a' }, {
      getUser: async () => ({
        primaryEmailAddressId: 'mail-a',
        emailAddresses: [{ id: 'mail-a', emailAddress: 'new-a@example.com', verification: verified }],
        firstName: 'New',
        lastName: 'Owner A',
      }),
      clock: () => new Date('2026-09-01T13:00:00.000Z'),
    })
    expect(result).toEqual({ synced: true, emailReady: true })
    expect(sqlite.prepare('SELECT email, display_name FROM users WHERE id = ?').get(USER_A)).toEqual({ email: 'new-a@example.com', display_name: 'New Owner A' })
    expect(sqlite.prepare('SELECT email, display_name FROM users WHERE id = ?').get(USER_B)).toEqual({ email: 'old-b@example.com', display_name: 'Old B' })
  })

  it('does not cross-map a profile when internal id and Clerk subject belong to different users', async () => {
    const result = await syncClerkProfile({ DB: db }, { userId: USER_A, subject: 'clerk-b' }, {
      getUser: async () => ({
        primaryEmailAddressId: 'mail-b',
        emailAddresses: [{ id: 'mail-b', emailAddress: 'attacker@example.com', verification: verified }],
      }),
    })
    expect(result).toEqual({ synced: false, emailReady: true })
    expect(sqlite.prepare('SELECT email FROM users WHERE id = ?').get(USER_A)).toEqual({ email: 'old-a@example.com' })
    expect(sqlite.prepare('SELECT email FROM users WHERE id = ?').get(USER_B)).toEqual({ email: 'old-b@example.com' })
  })

  it('keeps existing server data intact when Clerk is temporarily unavailable', async () => {
    const result = await syncClerkProfile({ DB: db }, { userId: USER_A, subject: 'clerk-a' }, {
      getUser: async () => { throw new Error('provider secret stack') },
    })
    expect(result).toEqual({ synced: false, emailReady: false })
    expect(sqlite.prepare('SELECT email, display_name FROM users WHERE id = ?').get(USER_A)).toEqual({ email: 'old-a@example.com', display_name: 'Old A' })
  })

  it('does not persist malformed Clerk email values', async () => {
    const result = await syncClerkProfile({ DB: db }, { userId: USER_A, subject: 'clerk-a' }, {
      getUser: async () => ({
        primaryEmailAddressId: 'mail-a',
        emailAddresses: [{ id: 'mail-a', emailAddress: 'owner@example.com\r\nBcc: victim@example.com', verification: verified }],
      }),
    })
    expect(result).toEqual({ synced: false, emailReady: false })
    expect(sqlite.prepare('SELECT email FROM users WHERE id = ?').get(USER_A)).toEqual({ email: 'old-a@example.com' })
  })
})
