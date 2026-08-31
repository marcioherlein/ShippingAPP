import { evaluateMarketSmoke } from './market-smoke-policy.mjs'

const baseUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 20000)
const STRICT_CONFIGURED = process.env.MARKET_SMOKE_STRICT_CONFIGURED !== '0'

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

function enforcePolicy(policy, context) {
  if (STRICT_CONFIGURED && policy.shouldFailStrictConfigured) {
    const failed = policy.checks.filter((check) => check.applicable && !check.passed).map((check) => check.name)
    throw new Error(`${context}: configured market provider failed strict gate (${policy.state}); failed checks: ${failed.join(', ')}`)
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

  const benchmark = await postJson('/api/mercadolibre/benchmark', {
    productName: 'Paleta de pádel carbono EVA',
    category: 'Padel racket',
  }, 'meli-benchmark')

  const allText = textOf(benchmark)
  if (allText.includes('Mercado Libre API 403')) {
    throw new Error(`meli-benchmark: benchmark still reports raw 403 failure: ${allText.slice(0, 2000)}`)
  }

  const policy = evaluateMarketSmoke(status, benchmark)
  enforcePolicy(policy, 'meli-benchmark')

  if (benchmark.status === 'live' && (!benchmark.market?.suggestedPriceArs || benchmark.market.suggestedPriceArs <= 0)) {
    throw new Error(`meli-benchmark: live benchmark without suggestedPriceArs: ${allText.slice(0, 2000)}`)
  }

  console.log(JSON.stringify({
    status: policy.healthy ? 'ok' : policy.state,
    baseUrl,
    marketHealth: policy,
    auth: publicAuthSummary(status),
    benchmark: {
      status: benchmark.status,
      query: benchmark.query,
      source: benchmark.market?.source,
      rawCount: benchmark.market?.rawCount,
      comparableCount: benchmark.market?.comparableCount,
      suggestedPriceArs: benchmark.market?.suggestedPriceArs,
      warnings: benchmark.market?.warnings,
    },
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
