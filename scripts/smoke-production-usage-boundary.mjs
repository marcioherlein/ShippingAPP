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
  if (response.status !== expected) {
    const body = await response.text().catch(() => '')
    throw new Error(`${label}: expected ${expected}, received ${response.status}; body=${body.slice(0, 500)}`)
  }
  return response
}

const brokenJson = (headers = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: '{broken',
})

// Usage state is a user-only resource. The service credential can keep CI/probes
// alive but must never become a customer account or inspect a customer's quota.
await expectStatus('anonymous usage view', 401, '/api/usage')
await expectStatus('service credential cannot read user usage', 401, '/api/usage', {
  headers: { 'x-shippingapp-internal-token': internalToken },
})
await expectStatus('service credential plus forged owner cannot read user usage', 401, '/api/usage', {
  headers: {
    'x-shippingapp-internal-token': internalToken,
    'x-shippingapp-user-id': 'victim-user-id',
    'x-shippingapp-auth-kind': 'user',
  },
})

// Auth must run before idempotency/body/provider work on a metered route. The
// deliberately malformed body would be 400 after authorization, so 401 proves
// an anonymous caller never reaches the economic/provider boundary.
await expectStatus(
  'anonymous metered market request rejected before body/provider work',
  401,
  '/api/argentina-market/benchmark',
  brokenJson({
    'idempotency-key': 'anonymous-usage-smoke',
    'x-shippingapp-plan': 'business',
    'x-shippingapp-credits': '999999',
  }),
)

// The same malformed request with the operational identity must cross auth and
// bypass customer metering, then fail normally at JSON parsing. It must not
// receive a customer reservation or credit counter header.
const serviceResponse = await expectStatus(
  'service credential bypasses customer debit only for operational execution',
  400,
  '/api/argentina-market/benchmark',
  brokenJson({ 'x-shippingapp-internal-token': internalToken }),
)
if (serviceResponse.headers.has('x-shippingapp-usage-reservation')) {
  throw new Error('Operational request unexpectedly received a customer usage reservation')
}
if (serviceResponse.headers.has('x-shippingapp-credits-remaining')) {
  throw new Error('Operational request unexpectedly exposed a customer credit counter')
}

console.log('Stage 5 production usage boundary adversarial smoke: PASS')
