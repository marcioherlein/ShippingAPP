import { describe, expect, it } from 'vitest'
import { emailPreferenceScopeForTemplate, renderApplicationEmail } from './emailTemplates'

describe('Stage 6 application email templates', () => {
  it('renders all required template families with explicit preference scopes', () => {
    expect(emailPreferenceScopeForTemplate('welcome')).toBe('transactional')
    expect(emailPreferenceScopeForTemplate('billing')).toBe('transactional')
    expect(emailPreferenceScopeForTemplate('weekly_digest')).toBe('digest')
    expect(emailPreferenceScopeForTemplate('usage')).toBe('alerts')
    expect(emailPreferenceScopeForTemplate('alert')).toBe('alerts')

    for (const key of ['welcome', 'usage', 'weekly_digest', 'alert', 'billing'] as const) {
      const rendered = renderApplicationEmail(key, { unsubscribeUrl: 'https://shippingapp.test/api/email-unsubscribe?token=abc' })
      expect(rendered.subject.length).toBeGreaterThan(3)
      expect(rendered.html).toContain('<!doctype html>')
      expect(rendered.text.length).toBeGreaterThan(10)
    }
  })

  it('escapes malicious product titles and digest lines instead of creating executable HTML', () => {
    const payload = `</strong><img src=x onerror="alert('xss')"><script>alert(1)</script>`
    const alert = renderApplicationEmail('alert', {
      productTitle: payload,
      unsubscribeUrl: 'https://shippingapp.test/api/email-unsubscribe?token=safe',
    })
    const digest = renderApplicationEmail('weekly_digest', {
      summaryLines: [payload],
      unsubscribeUrl: 'https://shippingapp.test/api/email-unsubscribe?token=safe',
    })

    expect(alert.html).not.toContain('<script>')
    expect(alert.html).not.toContain('<img src=x')
    expect(alert.html).toContain('&lt;script&gt;')
    expect(digest.html).not.toContain('<script>')
    expect(digest.html).not.toContain('<img src=x')
    expect(digest.html).toContain('&lt;img')
  })

  it('never emits an unsubscribe link for transactional templates', () => {
    const billing = renderApplicationEmail('billing', {
      unsubscribeUrl: 'https://attacker.invalid/unsubscribe',
      planName: 'Pro',
      billingStatus: 'active',
    })
    expect(billing.html).not.toContain('attacker.invalid')
    expect(billing.text).not.toContain('attacker.invalid')
  })

  it('rejects non-http unsubscribe URLs from rendered optional mail', () => {
    const digest = renderApplicationEmail('weekly_digest', { unsubscribeUrl: 'javascript:alert(1)' })
    expect(digest.html).not.toContain('javascript:')
    expect(digest.text).not.toContain('javascript:')
  })
})
