import type { D1DatabaseLike } from './persistence/d1'

export type AuthUserRow = {
  id: string
  auth_provider: string
  auth_subject: string
  created_at: string
  updated_at: string
}

function bounded(label: string, value: string, max: number) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new Error(`${label} must be between 1 and ${max} characters.`)
  }
  return value
}

export async function ensureAuthUser(
  db: D1DatabaseLike,
  input: { id: string; provider: string; subject: string; now?: Date },
): Promise<AuthUserRow> {
  const id = bounded('id', input.id, 64)
  const provider = bounded('provider', input.provider, 40)
  const subject = bounded('subject', input.subject, 191)
  const now = (input.now ?? new Date()).toISOString()

  await db.prepare(
    `INSERT INTO users (id, auth_provider, auth_subject, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(auth_provider, auth_subject) DO NOTHING`,
  ).bind(id, provider, subject, now, now).run()

  const row = await db.prepare(
    'SELECT id, auth_provider, auth_subject, created_at, updated_at FROM users WHERE auth_provider = ? AND auth_subject = ?',
  ).bind(provider, subject).first<AuthUserRow>()

  if (!row) throw new Error('Authenticated user mapping failed.')
  return row
}
