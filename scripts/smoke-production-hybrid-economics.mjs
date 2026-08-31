import { evaluateHybridEconomicsSmoke } from './hybrid-economics-smoke-policy.mjs'

const baseUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'
const REQUEST_TIMEOUT_MS = Number(process.env.HYBRID_ECONOMICS_SMOKE_TIMEOUT_MS || 40000)
const MIN_COMPARABLES = Number(process.env.ARGENTINA_MARKET_MIN_COMPARABLES || 5)

const message = 'Mouse inalámbrico Logitech M170 para computadora, origen China, precio proveedor USD 3, MOQ 100 unidades, peso embalado 0.10 kg por unidad, volumen 0.001 m3 por unidad.'

function fail(reason, body) {
  const evidence = body ? ` evidence=${JSON.stringify(body).slice(0, 3500)}` : ''
  throw new Error(`hybrid-economics-user-path: ${reason}.${evidence}`)
}

async function main() {
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
    fail(reason)
  } finally {
    clearTimeout(timeout)
  }

  let body
  try { body = JSON.parse(text) } catch {
    fail(`non-JSON HTTP ${response.status}: ${String(text).slice(0, 600)}`)
  }
  if (!response.ok) fail(`HTTP ${response.status}`, body)

  const policy = evaluateHybridEconomicsSmoke(body, { minComparables: MIN_COMPARABLES })
  if (!policy.healthy) {
    const failed = policy.checks.filter((check) => !check.passed).map((check) => check.name)
    fail(`policy failed (${Math.round(policy.successRate * 100)}% checks passed): ${failed.join(', ')}`, body)
  }

  const analysis = body.analysis
  const market = analysis.market
  const details = market.details
  console.log(JSON.stringify({
    status: 'ok',
    route: '/api/intake',
    userPathHealth: policy,
    intakeStatus: body.status,
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
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
