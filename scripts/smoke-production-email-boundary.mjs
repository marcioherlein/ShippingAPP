const baseUrl = (process.env.PRODUCTION_URL || '').replace(/\/$/, '')
const internalToken = process.env.INTERNAL_API_TOKEN || ''

if (!baseUrl) throw new Error('PRODUCTION_URL is required')
if (internalToken.length < 32) throw new Error('INTERNAL_API_TOKEN is required and must be at least 32 characters')

async function request(path, init = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  })
}

async function expectStatus(label, expected, path, init = {}) {
  const response = await request(path, init)
  const allowed = Array.isArray(expected) ? expected : [expected]
  if (!allowed.includes(response.status)) {
    const body = await response.text().catch(() => '')
    throw new Error(`${label}: expected ${allowed.join('/')}, received ${response.status}; body=${body.slice(0, 500)}`)
  }
  return response
}

const forgedOwnerHeaders = {
  'x-shippingapp-user-id': 'victim-user-id',
  'x-shippingapp-auth-subject': 'victim-clerk-subject',
  'x-shippingapp-auth-kind': 'user',
}

// Preferences are strictly user resources. Neither anonymous traffic, forged
// trusted headers nor the operational credential may become a customer.
await expectStatus('anonymous email preferences', 401, '/api/email-preferences')
await expectStatus('forged owner email preferences', 401, '/api/email-preferences', { headers: forgedOwnerHeaders })
await expectStatus('service credential cannot read customer email preferences', 401, '/api/email-preferences', {
  headers: { 'x-shippingapp-internal-token': internalToken },
})
await expectStatus('service credential plus forged owner cannot mutate email preferences', 401, '/api/email-preferences', {
  method: 'PATCH',
  headers: {
    'content-type': 'application/json',
    'x-shippingapp-internal-token': internalToken,
    ...forgedOwnerHeaders,
  },
  body: JSON.stringify({ marketingEnabled: true, digestEnabled: true }),
})

// Operational runtime status is internal-only and intentionally returns booleans
// and template names, never secret values or recipient data.
await expectStatus('anonymous email runtime', 401, '/api/email-runtime')
await expectStatus('wrong operational token email runtime', 401, '/api/email-runtime', {
  headers: { 'x-shippingapp-internal-token': 'x'.repeat(48) },
})
const runtimeResponse = await expectStatus('privileged email runtime', 200, '/api/email-runtime', {
  headers: { 'x-shippingapp-internal-token': internalToken },
})
const runtimeText = await runtimeResponse.text()
let runtime
try { runtime = JSON.parse(runtimeText) } catch { throw new Error(`email runtime returned non-JSON: ${runtimeText.slice(0, 300)}`) }
if (runtime?.status !== 'ok' || !runtime?.email) throw new Error(`email runtime unhealthy: ${runtimeText.slice(0, 500)}`)
const templates = Array.isArray(runtime.email.templates) ? runtime.email.templates : []
for (const required of ['welcome', 'usage', 'weekly_digest', 'alert', 'billing']) {
  if (!templates.includes(required)) throw new Error(`email runtime missing template ${required}`)
}
for (const forbidden of ['RESEND_API_KEY', 'EMAIL_UNSUBSCRIBE_SECRET', 'INTERNAL_API_TOKEN', 'CLERK_SECRET_KEY', 'apiKey', 'secretKey']) {
  if (runtimeText.includes(forbidden)) throw new Error(`email runtime leaked secret/config field ${forbidden}`)
}
if (runtimeText.includes(internalToken)) throw new Error('email runtime leaked the operational token value')

// Stage 6 does not require production sender/domain activation. When unsubscribe
// signing is configured, a forged token must be rejected. When it is deliberately
// unconfigured until Stage 8, the endpoint must fail closed with 503.
const forgedUnsubscribe = await expectStatus(
  'forged unsubscribe token fails closed',
  runtime.email.unsubscribeConfigured ? 400 : 503,
  '/api/email-unsubscribe?token=forged-stage6-token',
)
const forgedText = await forgedUnsubscribe.text()
if (/victim-user-id|recipient|@/.test(forgedText)) throw new Error('unsubscribe failure leaked user or recipient information')

console.log(`Stage 6 production email boundary smoke: PASS providerConfigured=${Boolean(runtime.email.providerConfigured)} senderConfigured=${Boolean(runtime.email.senderConfigured)} unsubscribeConfigured=${Boolean(runtime.email.unsubscribeConfigured)}`)
