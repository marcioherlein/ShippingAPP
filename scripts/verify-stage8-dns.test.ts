import { describe, expect, it } from 'vitest'
import { verifyStage8Dns } from './verify-stage8-dns.mjs'

const env = {
  STAGE8_PUBLIC_BASE_URL: 'https://app.shippingapp.com.ar',
  STAGE8_EMAIL_DOMAIN: 'shippingapp.com.ar',
  STAGE8_SPF_RECORD_NAME: 'mail.shippingapp.com.ar',
  STAGE8_SPF_EXPECTED_FRAGMENT: 'include:resend.example',
  STAGE8_DKIM_RECORD_NAME: 'selector._domainkey.shippingapp.com.ar',
  STAGE8_DKIM_EXPECTED_FRAGMENT: 'p=PUBLICKEY',
  STAGE8_DMARC_RECORD_NAME: '_dmarc.shippingapp.com.ar',
}

function deps(records: Record<string, string[]>, host = true) {
  return {
    hostResolves: async () => host,
    resolveTxt: async (name: string) => records[name] ?? [],
  }
}

describe('Stage 8 DNS readiness', () => {
  it('requires public host, SPF, DKIM and DMARC evidence', async () => {
    const result = await verifyStage8Dns(env, deps({
      'mail.shippingapp.com.ar': ['v=spf1 include:resend.example ~all'],
      'selector._domainkey.shippingapp.com.ar': ['v=DKIM1; k=rsa; p=PUBLICKEY'],
      '_dmarc.shippingapp.com.ar': ['v=DMARC1; p=none; rua=mailto:dmarc@shippingapp.com.ar'],
    }))
    expect(result.publicHost).toBe('app.shippingapp.com.ar')
    expect(result.spf.verified).toBe(true)
    expect(result.dkim.verified).toBe(true)
    expect(result.dmarc.verified).toBe(true)
  })

  it('fails closed if the final application host does not resolve', async () => {
    await expect(verifyStage8Dns(env, deps({}, false))).rejects.toThrow('stage8_public_host_unresolved')
  })

  it('does not accept an unrelated SPF fragment', async () => {
    await expect(verifyStage8Dns(env, deps({
      'mail.shippingapp.com.ar': ['v=spf1 include:attacker.example ~all'],
      'selector._domainkey.shippingapp.com.ar': ['v=DKIM1; p=PUBLICKEY'],
      '_dmarc.shippingapp.com.ar': ['v=DMARC1; p=none'],
    }))).rejects.toThrow('stage8_spf_not_verified')
  })

  it('requires the configured DKIM public evidence', async () => {
    await expect(verifyStage8Dns(env, deps({
      'mail.shippingapp.com.ar': ['v=spf1 include:resend.example ~all'],
      'selector._domainkey.shippingapp.com.ar': ['v=DKIM1; p=OTHER'],
      '_dmarc.shippingapp.com.ar': ['v=DMARC1; p=none'],
    }))).rejects.toThrow('stage8_dkim_not_verified')
  })

  it('requires an actual DMARC record', async () => {
    await expect(verifyStage8Dns(env, deps({
      'mail.shippingapp.com.ar': ['v=spf1 include:resend.example ~all'],
      'selector._domainkey.shippingapp.com.ar': ['v=DKIM1; p=PUBLICKEY'],
      '_dmarc.shippingapp.com.ar': ['not-dmarc'],
    }))).rejects.toThrow('stage8_dmarc_not_verified')
  })

  it('rejects public URLs with credentials or non-HTTPS schemes', async () => {
    await expect(verifyStage8Dns({ ...env, STAGE8_PUBLIC_BASE_URL: 'http://app.shippingapp.com.ar' }, deps({}))).rejects.toThrow('stage8_public_base_url_https_required')
    await expect(verifyStage8Dns({ ...env, STAGE8_PUBLIC_BASE_URL: 'https://user:pass@app.shippingapp.com.ar' }, deps({}))).rejects.toThrow('stage8_public_base_url_https_required')
  })
})
