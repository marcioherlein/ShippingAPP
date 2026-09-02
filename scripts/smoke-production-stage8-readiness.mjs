const base = (process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev').replace(/\/$/, '')
const token = process.env.INTERNAL_API_TOKEN || ''
const requireReady = process.env.STAGE8_REQUIRE_READY === '1'

async function read(path, headers = {}) {
  const response = await fetch(`${base}${path}`, { headers, redirect: 'manual' })
  let body = null
  try { body = await response.json() } catch { body = null }
  return { response, body }
}

const anonymous = await read('/api/production-readiness')
if (anonymous.response.status !== 401) {
  throw new Error(`Stage 8 readiness endpoint must reject anonymous access; got ${anonymous.response.status}`)
}
if (token.length < 32) throw new Error('INTERNAL_API_TOKEN must be configured for Stage 8 readiness smoke.')

const trusted = await read('/api/production-readiness', { 'x-shippingapp-internal-token': token })
if (!trusted.response.ok || !trusted.body || typeof trusted.body !== 'object') {
  throw new Error(`Stage 8 readiness endpoint failed: ${trusted.response.status}`)
}

const forbiddenKeys = ['apiKey', 'secret', 'token', 'recipient', 'authorization']
const serialized = JSON.stringify(trusted.body).toLowerCase()
for (const key of forbiddenKeys) {
  if (serialized.includes(`\"${key.toLowerCase()}\"`)) throw new Error(`Stage 8 readiness leaked sensitive field: ${key}`)
}

if (typeof trusted.body.sendingEnabled !== 'boolean') throw new Error('Stage 8 readiness missing sendingEnabled boolean.')
if (!Array.isArray(trusted.body.blockers)) throw new Error('Stage 8 readiness missing blocker list.')
if (trusted.body.sendingEnabled !== false && !requireReady) {
  throw new Error('Pre-cutover Stage 8 gate requires EMAIL_SENDING_ENABLED=false.')
}
if (requireReady) {
  if (trusted.body.configurationReady !== true) throw new Error(`Stage 8 configuration is not ready: ${JSON.stringify(trusted.body.blockers)}`)
  if (trusted.body.finalDomainConfigured !== true) throw new Error('Stage 8 final public domain is not configured.')
  if (trusted.body.authPartyIncludesPublicOrigin !== true) throw new Error('Stage 8 Clerk authorized parties do not include final public origin.')
  if (trusted.body.providerConfigured !== true) throw new Error('Stage 8 email provider is not configured.')
  if (trusted.body.senderDomainAligned !== true || trusted.body.replyToDomainAligned !== true || trusted.body.supportDomainAligned !== true) {
    throw new Error('Stage 8 sender/reply/support domains are not aligned with the final public identity.')
  }
}

console.log(JSON.stringify({
  status: 'ok',
  requireReady,
  publicHost: trusted.body.publicHost ?? null,
  finalDomainConfigured: trusted.body.finalDomainConfigured,
  configurationReady: trusted.body.configurationReady,
  sendingEnabled: trusted.body.sendingEnabled,
  blockers: trusted.body.blockers,
}))
