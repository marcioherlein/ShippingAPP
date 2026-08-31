import { evaluateMarketSmoke, evaluateRepresentativeMarketProbes } from './market-smoke-policy.mjs'

const baseUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 20000)
const STRICT_CONFIGURED = process.env.MARKET_SMOKE_STRICT_CONFIGURED !== '0'

// A provider-health smoke should not depend on one niche catalog query having
// five comparable listings at every instant. Each probe remains subject to the
// exact same strict live/comparable/price policy; we only broaden the sample.
const REPRESENTATIVE_PROBES = [
  { productName: 'Paleta de pádel', category: 'Padel' },
  { productName: 'Mouse inalámbrico', category: 'Mouse' },
  { productName: 'Auriculares bluetooth', category: 'Auriculares' },
]

async function postJson(path, payload, label) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response
  let text
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    text = await response.text()
  } catch (error) {
    const reason = error?.name === 'AbortError' ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : (error?.message || 'request failed')
    throw new Error(`${label}: ${path} ${reason}`)
  } finally {
    clearTimeout(timeout)
  }

  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`${label}: ${path} returned non-JSON HTTP ${response.status}: ${String(text).slice(0, 500)}`)
  }
  if (!response.ok) throw new Error(`${label}: ${path} failed HTTP ${response.status}: ${JSON.stringify(body).slice(0, 1200)}`)
  return body
}

async function getJson(path, label) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response
  let text
  try {
    response = await fetch(`${baseUrl}${path}`, { signal: controller.signal })
    text = await response.text()
  } catch (error) {
    const reason = error?.name === 'AbortError' ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : (error?.message || 'request failed')
    throw new Error(`${label}: ${path} ${reason}`)
  } finally {
    clearTimeout(timeout)
  }

  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`${label}: ${path} returned non-JSON HTTP ${response.status}: ${String(text).slice(0, 500)}`)
  }
  if (!response.ok) throw new Error(`${label}: ${path} failed HTTP ${response.status}: ${JSON.stringify(body).slice(0, 1200)}`)
  return body
}

function textOf(value) {
  return JSON.stringify(value || {})
}

function publicAuthSummary(status) {
  return {
    ready: status.auth?.ready,
    apiReady: status.auth?.apiReady,
    tokenSource: status.auth?.tokenSource,
    apiAccess: status.auth?.apiAccess,
  }
}

function sanitizedAttempts(attempts) {
  return attempts.map((attempt) => ({
    probe: attempt.probe,
    state: attempt.policy.state,
    benchmarkStatus: attempt.benchmark.status,
    query: attempt.benchmark.query,
    source: attempt.benchmark.market?.source,
    rawCount: attempt.benchmark.market?.rawCount,
    comparableCount: attempt.benchmark.market?.comparableCount,
    effectivePriceCount: attempt.benchmark.market?.effectivePriceCount,
    suggestedPriceArs: attempt.benchmark.market?.suggestedPriceArs,
    warnings: Array.isArray(attempt.benchmark.market?.warnings)
      ? attempt.benchmark.market.warnings.slice(0, 12)
      : [],
  }))
}

function enforcePolicy(policy, context) {
  if (STRICT_CONFIGURED && policy.shouldFailStrictConfigured) {
    const failed = policy.checks.filter((check) => check.applicable && !check.passed).map((check) => check.name)
    const probeStates = policy.representativeProbes?.map((probe) => probe.policy.state).join(', ') || 'n/a'
    throw new Error(`${context}: configured market provider failed strict gate (${policy.state}); failed checks: ${failed.join(', ')}; probe states: ${probeStates}`)
  }
}

async function main() {
  const status = await getJson('/api/mercadolibre/status', 'meli-status')

  if (!status.auth?.ready) {
    const policy = evaluateMarketSmoke(status)
    console.log(JSON.stringify({
      status: 'unconfigured',
      reason: 'MercadoLibre auth is not configured in this environment; market capability is explicitly not healthy.',
      marketHealth: policy,
      auth: publicAuthSummary(status),
    }, null, 2))
    return
  }

  if (status.auth?.apiReady === false) {
    const policy = evaluateMarketSmoke(status)
    enforcePolicy(policy, 'meli-status')
    console.log(JSON.stringify({
      status: 'configured_broken',
      reason: 'MercadoLibre credentials are loaded but authenticated API access is not ready.',
      marketHealth: policy,
      auth: publicAuthSummary(status),
    }, null, 2))
    return
  }

  const attempts = []
  for (const probe of REPRESENTATIVE_PROBES) {
    const benchmark = await postJson('/api/mercadolibre/benchmark', probe, `meli-benchmark:${probe.productName}`)
    const allText = textOf(benchmark)
    if (allText.includes('Mercado Libre API 403')) {
      throw new Error(`meli-benchmark:${probe.productName}: benchmark still reports raw 403 failure: ${allText.slice(0, 2000)}`)
    }

    const policy = evaluateMarketSmoke(status, benchmark)
    attempts.push({ probe, benchmark, policy })
    if (policy.healthy) break
  }

  const representativePolicy = evaluateRepresentativeMarketProbes(status, attempts.map((attempt) => attempt.benchmark))

  // Emit only sanitized aggregate/provider evidence before enforcing the gate.
  // This makes a red production run actionable without logging credentials or
  // dumping raw listings/titles that are unnecessary for diagnosis.
  console.log(JSON.stringify({
    event: 'mercadolibre.production_probe_evidence',
    state: representativePolicy.state,
    auth: publicAuthSummary(status),
    attempts: sanitizedAttempts(attempts),
  }, null, 2))

  enforcePolicy(representativePolicy, 'meli-benchmark')

  const winner = attempts.find((attempt) => attempt.policy.healthy) || attempts.at(-1)
  if (winner?.benchmark.status === 'live' && (!winner.benchmark.market?.suggestedPriceArs || winner.benchmark.market.suggestedPriceArs <= 0)) {
    throw new Error(`meli-benchmark:${winner.probe.productName}: live benchmark without suggestedPriceArs: ${textOf(winner.benchmark).slice(0, 2000)}`)
  }

  console.log(JSON.stringify({
    status: representativePolicy.healthy ? 'ok' : representativePolicy.state,
    baseUrl,
    marketHealth: representativePolicy,
    auth: publicAuthSummary(status),
    attempts: sanitizedAttempts(attempts),
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
