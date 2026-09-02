import { describe, expect, it } from 'vitest'
import { applyStage8ProductionConfig } from './apply-stage8-production-config.mjs'

const base = {
  name: 'shippingapp',
  vars: {
    AUTH_ENFORCEMENT: 'true',
    CLERK_AUTHORIZED_PARTIES: 'http://localhost:5173,https://shippingapp.marciofabrizio.workers.dev',
    EMAIL_APP_NAME: 'ShippingAPP',
    EMAIL_PUBLIC_BASE_URL: 'https://shippingapp.marciofabrizio.workers.dev',
    EMAIL_SENDING_ENABLED: 'false',
  },
}

describe('Stage 8 production config override', () => {
  it('applies server-owned production identity values while forcing sending off', () => {
    const next = applyStage8ProductionConfig(base, {
      STAGE8_PUBLIC_BASE_URL: 'https://app.shippingapp.com.ar/path',
      STAGE8_EMAIL_APP_NAME: 'ShippingAPP Argentina',
      STAGE8_CLERK_AUTHORIZED_PARTIES: 'http://localhost:5173,https://app.shippingapp.com.ar',
      STAGE8_EMAIL_FROM: 'ShippingAPP <noreply@shippingapp.com.ar>',
      STAGE8_EMAIL_REPLY_TO: 'soporte@shippingapp.com.ar',
      STAGE8_EMAIL_SUPPORT_EMAIL: 'soporte@shippingapp.com.ar',
      EMAIL_SENDING_ENABLED: 'true',
    })
    expect(next.vars.EMAIL_PUBLIC_BASE_URL).toBe('https://app.shippingapp.com.ar')
    expect(next.vars.EMAIL_APP_NAME).toBe('ShippingAPP Argentina')
    expect(next.vars.CLERK_AUTHORIZED_PARTIES).toContain('https://app.shippingapp.com.ar')
    expect(next.vars.EMAIL_FROM).toContain('noreply@shippingapp.com.ar')
    expect(next.vars.EMAIL_SENDING_ENABLED).toBe('false')
  })

  it('preserves safe development fallbacks when Stage 8 variables are absent', () => {
    const next = applyStage8ProductionConfig(base, {})
    expect(next.vars.EMAIL_PUBLIC_BASE_URL).toBe('https://shippingapp.marciofabrizio.workers.dev')
    expect(next.vars.EMAIL_SENDING_ENABLED).toBe('false')
  })

  it('rejects non-HTTPS or credential-bearing public identities', () => {
    expect(() => applyStage8ProductionConfig(base, { STAGE8_PUBLIC_BASE_URL: 'http://example.com' })).toThrow('stage8_public_base_url_invalid')
    expect(() => applyStage8ProductionConfig(base, { STAGE8_PUBLIC_BASE_URL: 'https://user:pw@example.com' })).toThrow('stage8_public_base_url_invalid')
  })

  it('rejects CRLF injection in deployment-controlled sender values', () => {
    expect(() => applyStage8ProductionConfig(base, {
      STAGE8_EMAIL_FROM: 'ShippingAPP <noreply@example.com>\r\nBcc: attacker@example.com',
    })).toThrow('stage8_email_from_invalid')
  })
})
