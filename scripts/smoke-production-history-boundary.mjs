const baseUrl = (process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev').replace(/\/$/, '')
const internalToken = process.env.INTERNAL_API_TOKEN || ''

if (internalToken.length < 32) {
  throw new Error('INTERNAL_API_TOKEN is required for the Stage 3 production history boundary smoke.')
}

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init)
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: response.status, body }
}

function expectStatus(label, actual, expected) {
  if (actual.status !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, received ${actual.status}: ${JSON.stringify(actual.body)}`)
  }
}

const forgedUserId = 'user-forged-00000000-0000-4000-8000-000000000001'
const fakeAnalysisId = 'analysis-does-not-exist'
const forgedHeaders = {
  'x-shippingapp-auth-kind': 'user',
  'x-shippingapp-user-id': forgedUserId,
  'x-shippingapp-auth-subject': 'forged-subject',
}

// Anonymous callers must fail at the auth gate before history storage is touched.
expectStatus('anonymous history list', await request('/api/history'), 401)
expectStatus('anonymous history detail', await request(`/api/history-item?id=${encodeURIComponent(fakeAnalysisId)}`), 401)
expectStatus('anonymous history delete', await request(`/api/history-item?id=${encodeURIComponent(fakeAnalysisId)}`, { method: 'DELETE' }), 401)

// Caller-controlled trusted-looking identity headers must never become an owner identity.
expectStatus('forged identity history list', await request('/api/history', { headers: forgedHeaders }), 401)
expectStatus('forged identity history save', await request('/api/history', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...forgedHeaders },
  body: JSON.stringify({
    userId: forgedUserId,
    idempotencyKey: 'forged-owner-production-smoke',
    input: { productName: 'forged owner probe' },
    result: { pipelineSummary: { totalCostUsd: 1 } },
  }),
}), 401)

// The operations credential is intentionally allowed through the auth gate for
// many customer compute routes, but history must still require a real user identity.
const serviceHeaders = {
  'x-shippingapp-internal-token': internalToken,
  ...forgedHeaders,
}
expectStatus('service token history list', await request('/api/history', { headers: serviceHeaders }), 401)
expectStatus('service token history detail', await request(`/api/history-item?id=${encodeURIComponent(fakeAnalysisId)}`, { headers: serviceHeaders }), 401)
expectStatus('service token forged history save', await request('/api/history', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...serviceHeaders },
  body: JSON.stringify({
    userId: forgedUserId,
    idempotencyKey: 'service-owner-production-smoke',
    input: { productName: 'service identity probe' },
    result: { pipelineSummary: { totalCostUsd: 1 } },
  }),
}), 401)

console.log('Production private-history boundary smoke PASS: anonymous, forged-user and service-token identities cannot access user history.')
