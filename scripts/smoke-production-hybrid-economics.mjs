import { evaluateHybridEconomicsSmoke } from './hybrid-economics-smoke-policy.mjs'

const baseUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'
const REQUEST_TIMEOUT_MS = Number(process.env.HYBRID_ECONOMICS_SMOKE_TIMEOUT_MS || 40000)
const MIN_COMPARABLES = Number(process.env.ARGENTINA_MARKET_MIN_COMPARABLES || 5)
const MAX_ATTEMPTS = Math.max(1, Math.min(3, Number(process.env.HYBRID_ECONOMICS_SMOKE_ATTEMPTS || 3)))
const RETRY_DELAY_MS = Math.max(250, Math.min(5000, Number(process.env.HYBRID_ECONOMICS_SMOKE_RETRY_MS || 2000)))

const message = 'Mouse inalámbrico Logitech M170 para computadora, origen China, precio proveedor USD 3, MOQ 100 unidades, peso embalado 0.10 kg por unidad, volumen 0.001 m3 por unidad.'

function fail(reason, body) {
  const evidence = body ? ` evidence=${JSON.stringify(body).slice(0, 3500)}` : ''
  throw new Error(`hybrid-economics-user-path: ${reason}.${evidence}`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function requestIntake() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response
  let text
  try {
    response = await fetch(`${baseUrl}/api/intake`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    })
    text = await response.text()
  } catch (error) {
    const reason = error?.name === 'AbortError'
      ? `timed out after ${REQUEST_TIMEOUT_MS}ms`
      : (error?.message || 'request failed')
    return { ok: false, reason, body: null, policy: null }
  } finally {
    clearTimeout(timeout)
  }

  let body
  try {
    body = JSON.parse(text)
  } catch {
    return { ok: false, reason: `non-JSON HTTP ${response.status}: ${String(text).slice(0, 600)}`, body: null, policy: null }
  }
  if (!response.ok) return { ok: false, reason: `HTTP ${response.status}`, body, policy: null }

  const policy = evaluateHybridEconomicsSmoke(body, { minComparables: MIN_COMPARABLES })
  if (!policy.healthy) {
    const failed = policy.checks.filter((check) => !check.passed).map((check) => check.name)
    return {
      ok: false,
      reason: `policy failed (${Math.round(policy.successRate * 100)}% checks passed): ${failed.join(', ')}`,
      body,
      policy,
    }
  }

  return { ok: true, reason: null, body, policy }
}

async function main() {
  let lastFailure = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await requestIntake()
    if (result.ok) {
      const analysis = result.body.analysis
      const market = analysis.market
      const details = market.details
      console.log(JSON.stringify({
        status: 'ok',
        route: '/api/intake',
        attempt,
        maxAttempts: MAX_ATTEMPTS,
        userPathHealth: result.policy,
        intakeStatus: result.body.status,
        product: {
          name: analysis.product.name,
          category: analysis.product.category,
        },
        market: {
          status: details.status,
          source: market.source,
          rawCount: details.rawCount,
          comparableCount: details.comparableCount,
          estimatedPriceArs: market.estimatedPriceArs,
          suggestedPriceArs: details.suggestedPriceArs,
          confidence: analysis.confidence.market,
          traceableComparables: details.comparables.length,
        },
      }, null, 2))
      return
    }

    lastFailure = result
    console.warn(`hybrid-economics-user-path attempt ${attempt}/${MAX_ATTEMPTS} failed: ${result.reason}`)
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS)
  }

  fail(`failed all ${MAX_ATTEMPTS} bounded attempts; last failure: ${lastFailure?.reason || 'unknown failure'}`, lastFailure?.body)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
