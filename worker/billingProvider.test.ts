import { describe, expect, it, vi } from 'vitest'
import { BillingProviderError, MercadoPagoBillingProvider, resolveBillingBackUrl, resolveBillingPlanConfiguration } from './billingProvider'

describe('Stage 9 Mercado Pago BillingProvider boundary', () => {
  it('resolves only server-configured paid plan IDs and never a client amount', () => {
    const env = {
      MERCADOPAGO_PRO_PLAN_ID: 'provider-pro-123',
      MERCADOPAGO_BUSINESS_PLAN_ID: 'provider-business-456',
    }
    expect(resolveBillingPlanConfiguration(env, 'pro')).toEqual({ planCode: 'pro', providerPlanId: 'provider-pro-123' })
    expect(resolveBillingPlanConfiguration(env, 'business')).toEqual({ planCode: 'business', providerPlanId: 'provider-business-456' })
    expect(resolveBillingPlanConfiguration(env, 'free')).toBeNull()
    expect(resolveBillingPlanConfiguration(env, 'enterprise')).toBeNull()
  })

  it('builds subscription creation only from server inputs and sends provider idempotency', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body).toEqual({
        preapproval_plan_id: 'server-plan-pro',
        payer_email: 'owner@example.com',
        external_reference: 'sub_internal_123',
        back_url: 'https://app.example.com',
      })
      expect(new Headers(init?.headers).get('x-idempotency-key')).toBe('checkout-key-123')
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret-token')
      return Response.json({
        id: 'mp-sub-1',
        status: 'pending',
        external_reference: 'sub_internal_123',
        preapproval_plan_id: 'server-plan-pro',
        payer_email: 'owner@example.com',
        init_point: 'https://www.mercadopago.com.ar/subscriptions/checkout?x=1',
      })
    })
    const provider = new MercadoPagoBillingProvider({ MERCADOPAGO_BILLING_ACCESS_TOKEN: 'secret-token' }, fetcher as typeof fetch)
    const result = await provider.createSubscription({
      providerPlanId: 'server-plan-pro',
      payerEmail: 'owner@example.com',
      externalReference: 'sub_internal_123',
      backUrl: 'https://app.example.com/billing/success?fake=1',
      idempotencyKey: 'checkout-key-123',
    })
    expect(result.id).toBe('mp-sub-1')
    expect(result.checkoutUrl).toContain('mercadopago.com.ar')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('rejects CRLF/header-style injection before any provider call', async () => {
    const fetcher = vi.fn()
    const provider = new MercadoPagoBillingProvider({ MERCADOPAGO_BILLING_ACCESS_TOKEN: 'secret-token' }, fetcher as typeof fetch)
    await expect(provider.createSubscription({
      providerPlanId: 'plan\r\nX-Forged: yes',
      payerEmail: 'owner@example.com',
      externalReference: 'sub-1',
      backUrl: 'https://app.example.com',
      idempotencyKey: 'checkout-key-123',
    })).rejects.toMatchObject({ code: 'billing_checkout_payload_invalid' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fails closed and sanitizes provider error bodies and credentials', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      message: 'internal provider error access_token=super-secret',
      email: 'other-user@example.com',
    }), { status: 500, headers: { 'content-type': 'application/json' } }))
    const provider = new MercadoPagoBillingProvider({ MERCADOPAGO_BILLING_ACCESS_TOKEN: 'super-secret' }, fetcher as typeof fetch)
    let error: unknown
    try { await provider.getSubscription('mp-sub-1') } catch (caught) { error = caught }
    expect(error).toBeInstanceOf(BillingProviderError)
    expect((error as BillingProviderError).code).toBe('billing_provider_rejected')
    expect(String((error as Error).message)).not.toContain('super-secret')
    expect(String((error as Error).message)).not.toContain('other-user@example.com')
  })

  it('uses only HTTPS credential-free application origins for billing return URL', () => {
    expect(resolveBillingBackUrl({ APP_PRODUCTION_URL: 'https://app.example.com/some/path' })).toBe('https://app.example.com')
    expect(resolveBillingBackUrl({ APP_PRODUCTION_URL: 'http://app.example.com' })).toBeNull()
    expect(resolveBillingBackUrl({ APP_PRODUCTION_URL: 'https://user:pass@app.example.com' })).toBeNull()
  })
})
