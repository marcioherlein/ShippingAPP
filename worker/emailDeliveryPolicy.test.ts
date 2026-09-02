import { describe, expect, it } from 'vitest'
import { emailCanaryUserIds, emailDeliveryAllowed, emailDeliveryMode, emailDeliveryPolicyStatus } from './emailDeliveryPolicy'

describe('Stage 8 email delivery blast barrier', () => {
  it('defaults fail-closed unless both master switch and explicit mode allow delivery', () => {
    expect(emailDeliveryMode({})).toBe('off')
    expect(emailDeliveryMode({ EMAIL_SENDING_ENABLED: 'false', EMAIL_DELIVERY_MODE: 'all' })).toBe('off')
    expect(emailDeliveryMode({ EMAIL_SENDING_ENABLED: 'true' })).toBe('off')
    expect(emailDeliveryAllowed({ EMAIL_SENDING_ENABLED: 'true' }, 'user-a')).toMatchObject({ allowed: false, mode: 'off' })
  })

  it('allows only explicit server-side user ids in canary mode', () => {
    const env = {
      EMAIL_SENDING_ENABLED: 'true',
      EMAIL_DELIVERY_MODE: 'canary',
      EMAIL_CANARY_USER_IDS: 'user-a,user-b,user-a',
    }
    expect(emailCanaryUserIds(env)).toEqual(['user-a', 'user-b'])
    expect(emailDeliveryAllowed(env, 'user-a')).toMatchObject({ allowed: true, mode: 'canary' })
    expect(emailDeliveryAllowed(env, 'user-z')).toMatchObject({ allowed: false, mode: 'canary', code: 'email_canary_recipient_required' })
  })

  it('fails closed on malformed or oversized canary configuration', () => {
    const malformed = {
      EMAIL_SENDING_ENABLED: 'true',
      EMAIL_DELIVERY_MODE: 'canary',
      EMAIL_CANARY_USER_IDS: 'user-a,user b',
    }
    expect(emailCanaryUserIds(malformed)).toEqual([])
    expect(emailDeliveryAllowed(malformed, 'user-a').allowed).toBe(false)

    const tooMany = Array.from({ length: 21 }, (_, index) => `u${index}`).join(',')
    expect(emailCanaryUserIds({ ...malformed, EMAIL_CANARY_USER_IDS: tooMany })).toEqual([])
  })

  it('allows all server-owned users only in explicit all mode', () => {
    const env = { EMAIL_SENDING_ENABLED: 'true', EMAIL_DELIVERY_MODE: 'all' }
    expect(emailDeliveryAllowed(env, 'any-valid-server-user').allowed).toBe(true)
    expect(emailDeliveryPolicyStatus(env)).toEqual({
      mode: 'all',
      sendingEnabled: true,
      canaryConfigured: true,
      canaryUserCount: 0,
    })
  })

  it('reports canary status as aggregates without exposing allowlisted ids', () => {
    const env = {
      EMAIL_SENDING_ENABLED: 'true',
      EMAIL_DELIVERY_MODE: 'canary',
      EMAIL_CANARY_USER_IDS: 'secret-user-a,secret-user-b',
    }
    const serialized = JSON.stringify(emailDeliveryPolicyStatus(env))
    expect(serialized).not.toContain('secret-user-a')
    expect(serialized).not.toContain('secret-user-b')
    expect(emailDeliveryPolicyStatus(env)).toMatchObject({ mode: 'canary', canaryConfigured: true, canaryUserCount: 2 })
  })
})
