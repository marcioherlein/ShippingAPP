const baseUrl = (process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev').replace(/\/$/, '')
const internalToken = process.env.INTERNAL_API_TOKEN || ''

if (internalToken.length < 32) {
  throw new Error('INTERNAL_API_TOKEN is required for the Stage 4 production watchlist boundary smoke.')
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

const forgedUserId = 'user-forged-watchlist-0000-4000-800000000001'
const fakeAnalysisId = 'analysis-does-not-exist'
const fakeItemId = 'watchlist-does-not-exist'
const forgedHeaders = {
  'x-shippingapp-auth-kind': 'user',
  'x-shippingapp-user-id': forgedUserId,
  'x-shippingapp-auth-subject': 'forged-watchlist-subject',
}

// Anonymous callers fail before watchlist persistence/provider work.
expectStatus('anonymous watchlist list', await request('/api/watchlist'), 401)
expectStatus('anonymous watchlist add', await request('/api/watchlist', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ analysisId: fakeAnalysisId }),
}), 401)
expectStatus('anonymous watchlist detail', await request(`/api/watchlist-item?id=${encodeURIComponent(fakeItemId)}`), 401)
expectStatus('anonymous watchlist delete', await request(`/api/watchlist-item?id=${encodeURIComponent(fakeItemId)}`, { method: 'DELETE' }), 401)
expectStatus('anonymous watchlist refresh', await request(`/api/watchlist-refresh?id=${encodeURIComponent(fakeItemId)}`, {
  method: 'POST', headers: { 'idempotency-key': 'anonymous-refresh-probe' },
}), 401)

// Forged trusted-looking identity headers must never become a user identity.
expectStatus('forged watchlist list', await request('/api/watchlist', { headers: forgedHeaders }), 401)
expectStatus('forged watchlist add', await request('/api/watchlist', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...forgedHeaders },
  body: JSON.stringify({
    userId: forgedUserId,
    analysisId: fakeAnalysisId,
    marketPriceArs: 1,
    landedCostArs: 1,
    grossMarginPct: 999,
  }),
}), 401)
expectStatus('forged watchlist refresh', await request(`/api/watchlist-refresh?id=${encodeURIComponent(fakeItemId)}`, {
  method: 'POST',
  headers: { 'idempotency-key': 'forged-refresh-probe', ...forgedHeaders },
}), 401)

// Operational service credentials can cross the outer auth gate on selected
// routes, but the watchlist handler itself requires a real user identity.
const serviceHeaders = {
  'x-shippingapp-internal-token': internalToken,
  ...forgedHeaders,
}
expectStatus('service token watchlist list', await request('/api/watchlist', { headers: serviceHeaders }), 401)
expectStatus('service token watchlist add', await request('/api/watchlist', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...serviceHeaders },
  body: JSON.stringify({ analysisId: fakeAnalysisId }),
}), 401)
expectStatus('service token watchlist detail', await request(`/api/watchlist-item?id=${encodeURIComponent(fakeItemId)}`, { headers: serviceHeaders }), 401)
expectStatus('service token watchlist delete', await request(`/api/watchlist-item?id=${encodeURIComponent(fakeItemId)}`, { method: 'DELETE', headers: serviceHeaders }), 401)
expectStatus('service token watchlist refresh', await request(`/api/watchlist-refresh?id=${encodeURIComponent(fakeItemId)}`, {
  method: 'POST',
  headers: { 'idempotency-key': 'service-refresh-probe', ...serviceHeaders },
}), 401)

console.log('Production watchlist boundary smoke PASS: anonymous, forged-user and service-token identities cannot access, mutate or refresh user watchlists.')
