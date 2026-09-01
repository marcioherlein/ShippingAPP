const base = String(process.env.PRODUCTION_URL || '').replace(/\/$/, '')
const token = String(process.env.INTERNAL_API_TOKEN || '')
if (!base) throw new Error('PRODUCTION_URL is required')
if (token.length < 32) throw new Error('INTERNAL_API_TOKEN must be at least 32 characters')

async function call(path, init = {}, auth = null) {
  const headers = new Headers(init.headers || {})
  if (auth === 'valid') headers.set('x-shippingapp-internal-token', token)
  if (auth === 'invalid') headers.set('x-shippingapp-internal-token', `${token.slice(0, -1)}x`)
  const response = await fetch(`${base}${path}`, { ...init, headers })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { response, body, text }
}

function assertNoPii(body, label) {
  const text = JSON.stringify(body)
  const forbidden = ['recipient', 'emailAddress', 'userId', 'productTitle', 'summaryLines', 'messageBody', 'htmlBody']
  for (const key of forbidden) {
    if (text.includes(key)) throw new Error(`${label} leaked forbidden field ${key}: ${text}`)
  }
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) throw new Error(`${label} leaked an email address`)
}

const anonymous = await call('/api/digest-runtime')
if (anonymous.response.status !== 401) throw new Error(`anonymous digest runtime expected 401, got ${anonymous.response.status}`)

const forged = await call('/api/digest-runtime', {}, 'invalid')
if (forged.response.status !== 401) throw new Error(`invalid service token expected 401, got ${forged.response.status}`)

const runtime = await call('/api/digest-runtime', {}, 'valid')
if (!runtime.response.ok) throw new Error(`digest runtime failed: ${runtime.response.status} ${runtime.text}`)
if (!runtime.body || typeof runtime.body.runKey !== 'string' || typeof runtime.body.eligibleCount !== 'number') {
  throw new Error(`digest runtime shape mismatch: ${runtime.text}`)
}
if (!String(runtime.body.policy || '').includes('weekly-once-per-user')) throw new Error(`digest runtime policy missing: ${runtime.text}`)
assertNoPii(runtime.body, 'digest runtime')

const dryRun = await call('/api/digest-dry-run', { method: 'POST' }, 'valid')
if (!dryRun.response.ok) throw new Error(`digest dry-run failed: ${dryRun.response.status} ${dryRun.text}`)
if (!dryRun.body || dryRun.body.runKey !== runtime.body.runKey || typeof dryRun.body.eligibleCount !== 'number') {
  throw new Error(`digest dry-run shape mismatch: ${dryRun.text}`)
}
assertNoPii(dryRun.body, 'digest dry-run')

console.log(JSON.stringify({
  status: 'ok',
  runKey: runtime.body.runKey,
  dueAt: runtime.body.dueAt,
  eligibleCount: runtime.body.eligibleCount,
  sendingEnabled: runtime.body.sendingEnabled,
  latestRunStatus: runtime.body.latestRun?.status ?? null,
}))
