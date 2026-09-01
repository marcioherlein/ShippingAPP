import { describe, expect, it } from 'vitest'
import { createUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribeToken'

const SECRET = 'stage-6-unsubscribe-secret-0000000000000000000000000000'

describe('Stage 6 signed unsubscribe tokens', () => {
  it('round-trips the signed owner and optional preference scope', async () => {
    const token = await createUnsubscribeToken({
      userId: 'user-a',
      scope: 'digest',
      secret: SECRET,
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    })
    await expect(verifyUnsubscribeToken(token, SECRET, new Date('2026-09-01T00:00:00Z'))).resolves.toEqual({
      v: 1,
      userId: 'user-a',
      scope: 'digest',
      exp: 1798761600,
    })
  })

  it('rejects forged payloads and signatures', async () => {
    const token = await createUnsubscribeToken({
      userId: 'user-a',
      scope: 'alerts',
      secret: SECRET,
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    })
    const [payload, signature] = token.split('.')
    const forgedPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`
    await expect(verifyUnsubscribeToken(`${forgedPayload}.${signature}`, SECRET, new Date('2026-09-01T00:00:00Z'))).resolves.toBeNull()
    await expect(verifyUnsubscribeToken(token, `${SECRET}wrong`, new Date('2026-09-01T00:00:00Z'))).resolves.toBeNull()
  })

  it('rejects expired tokens and weak secrets', async () => {
    const token = await createUnsubscribeToken({
      userId: 'user-a',
      scope: 'marketing',
      secret: SECRET,
      expiresAt: new Date('2026-09-02T00:00:00Z'),
    })
    await expect(verifyUnsubscribeToken(token, SECRET, new Date('2026-09-03T00:00:00Z'))).resolves.toBeNull()
    await expect(verifyUnsubscribeToken(token, 'short', new Date('2026-09-01T00:00:00Z'))).resolves.toBeNull()
  })

  it('does not permit a transactional unsubscribe scope', async () => {
    await expect(createUnsubscribeToken({
      userId: 'user-a',
      scope: 'transactional' as any,
      secret: SECRET,
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    })).rejects.toThrow('unsubscribe_scope_invalid')
  })
})
