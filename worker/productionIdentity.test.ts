import { describe, expect, it } from 'vitest'
import { productionIdentityStatus } from './productionIdentity'

const READY = {
  EMAIL_APP_NAME: 'ShippingAPP',
  EMAIL_PUBLIC_BASE_URL: 'https://app.shippingapp.com.ar',
  CLERK_AUTHORIZED_PARTIES: 'http://localhost:5173,https://app.shippingapp.com.ar',
  RESEND_API_KEY: 're_test_stage8',
  EMAIL_FROM: 'ShippingAPP <noreply@shippingapp.com.ar>',
  EMAIL_REPLY_TO: 'soporte@shippingapp.com.ar',
  EMAIL_SUPPORT_EMAIL: 'soporte@shippingapp.com.ar',
  EMAIL_UNSUBSCRIBE_SECRET: 'x'.repeat(48),
  EMAIL_SENDING_ENABLED: 'false',
}

describe('Stage 8 production identity readiness', () => {
  it('accepts a final HTTPS app domain and aligned mail identities without enabling sends', () => {
    const status = productionIdentityStatus(READY)
    expect(status.finalDomainConfigured).toBe(true)
    expect(status.authPartyIncludesPublicOrigin).toBe(true)
    expect(status.providerConfigured).toBe(true)
    expect(status.senderDomainAligned).toBe(true)
    expect(status.replyToDomainAligned).toBe(true)
    expect(status.supportDomainAligned).toBe(true)
    expect(status.configurationReady).toBe(true)
    expect(status.sendingEnabled).toBe(false)
    expect(status.activationBlocked).toBe(true)
    expect(status.blockers).toEqual([])
  })

  it('does not treat workers.dev as the final Stage 8 public identity', () => {
    const status = productionIdentityStatus({
      ...READY,
      EMAIL_PUBLIC_BASE_URL: 'https://shippingapp.marciofabrizio.workers.dev',
      CLERK_AUTHORIZED_PARTIES: 'https://shippingapp.marciofabrizio.workers.dev',
    })
    expect(status.finalDomainConfigured).toBe(false)
    expect(status.configurationReady).toBe(false)
    expect(status.blockers).toContain('final_public_domain_required')
  })

  it('rejects a final host that is missing from Clerk authorized parties', () => {
    const status = productionIdentityStatus({
      ...READY,
      CLERK_AUTHORIZED_PARTIES: 'https://old.example.com',
    })
    expect(status.authPartyIncludesPublicOrigin).toBe(false)
    expect(status.blockers).toContain('authorized_party_missing_public_origin')
  })

  it('rejects sender/reply/support identities on unrelated domains', () => {
    const status = productionIdentityStatus({
      ...READY,
      EMAIL_FROM: 'ShippingAPP <noreply@attacker.example>',
      EMAIL_REPLY_TO: 'reply@attacker.example',
      EMAIL_SUPPORT_EMAIL: 'support@attacker.example',
    })
    expect(status.senderDomainAligned).toBe(false)
    expect(status.replyToDomainAligned).toBe(false)
    expect(status.supportDomainAligned).toBe(false)
    expect(status.blockers).toEqual(expect.arrayContaining([
      'sender_domain_not_aligned',
      'reply_to_domain_not_aligned',
      'support_domain_not_aligned',
    ]))
  })

  it('fails closed on malformed public URLs and header injection', () => {
    const status = productionIdentityStatus({
      ...READY,
      EMAIL_PUBLIC_BASE_URL: 'javascript:alert(1)',
      EMAIL_FROM: 'ShippingAPP <noreply@shippingapp.com.ar>\r\nBcc:evil@example.com',
    })
    expect(status.publicOrigin).toBeNull()
    expect(status.finalDomainConfigured).toBe(false)
    expect(status.senderConfigured).toBe(false)
    expect(status.configurationReady).toBe(false)
  })

  it('keeps canary delivery from being reported as broad sending permission', () => {
    const status = productionIdentityStatus({
      ...READY,
      EMAIL_SENDING_ENABLED: 'true',
      EMAIL_DELIVERY_MODE: 'canary',
      EMAIL_CANARY_USER_IDS: 'user-canary-1',
    })
    expect(status.configurationReady).toBe(true)
    expect(status.sendingEnabled).toBe(false)
    expect(status.activationBlocked).toBe(true)
  })

  it('does not claim external DNS/delivery readiness merely because broad delivery is explicitly enabled', () => {
    const status = productionIdentityStatus({
      ...READY,
      EMAIL_SENDING_ENABLED: 'true',
      EMAIL_DELIVERY_MODE: 'all',
    })
    expect(status.configurationReady).toBe(true)
    expect(status.sendingEnabled).toBe(true)
    expect(status.activationBlocked).toBe(false)
    // DNS/provider delivery is intentionally a separate Stage 8 production gate.
    expect((status as any).dnsVerified).toBeUndefined()
  })
})
