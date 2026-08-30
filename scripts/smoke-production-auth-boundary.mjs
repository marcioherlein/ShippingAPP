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
}

const postJson = (headers = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: '{}',
})

// Internal diagnostics must be inaccessible without the server-only credential.
await expectStatus('runtime smoke without service credential', 401, '/api/runtime-smoke')
await expectStatus('runtime smoke with wrong service credential', 401, '/api/runtime-smoke', {
  headers: { 'x-shippingapp-internal-token': 'x'.repeat(48) },
})

// Every customer-compute boundary must reject direct anonymous Worker calls before
// parsing payloads or invoking AI/browser/provider work.
for (const path of [
  '/api/analyze',
  '/api/opportunity-search',
  '/api/intake',
  '/api/ncm-classify',
  '/api/mercadolibre/benchmark',
  '/api/chat',
]) {
  await expectStatus(`anonymous ${path}`, 401, path, postJson())
}

// Trusted identity headers are server-generated only. Caller-forged values must
// never select a tenant or grant access.
await expectStatus('forged trusted identity headers', 401, '/api/analyze', postJson({
  'x-shippingapp-user-id': 'victim-user-id',
  'x-shippingapp-auth-subject': 'victim-clerk-subject',
  'x-shippingapp-auth-kind': 'user',
}))

// Invalid/forged bearer credentials must fail closed.
await expectStatus('invalid bearer token', 401, '/api/analyze', postJson({
  authorization: 'Bearer definitely-not-a-valid-clerk-jwt',
}))

// The operational credential may run server-side smokes on customer routes, but
// it must never become a user identity or access /api/me.
await expectStatus('service credential cannot impersonate /api/me', 401, '/api/me', {
  headers: { 'x-shippingapp-internal-token': internalToken },
})

// Prove the same credential still works for its intended internal purpose.
const serviceResponse = await request('/api/runtime-smoke', {
  headers: { 'x-shippingapp-internal-token': internalToken },
})
if (!serviceResponse.ok) {
  throw new Error(`valid internal credential failed: ${serviceResponse.status}`)
}
const serviceBody = await serviceResponse.json()
if (serviceBody?.status !== 'ok') {
  throw new Error(`valid internal credential returned unexpected payload: ${JSON.stringify(serviceBody)}`)
}

console.log('Stage 2 production auth boundary adversarial smoke: PASS')
