import { evaluateArgentinaMarketSmoke } from './argentina-market-smoke-policy.mjs'

const baseUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 25000)
const MIN_COMPARABLES = Number(process.env.ARGENTINA_MARKET_MIN_COMPARABLES || 5)

const probes = [
  { id: 'logitech-m170', productName: 'Logitech M170', category: 'mouse inalámbrico' },
  { id: 'samsung-a16-128-4', productName: 'Samsung Galaxy A16 128GB 4GB', category: 'celular' },
  { id: 'motorola-g15-256-4', productName: 'Motorola G15 256GB 4GB', category: 'celular' },
]

async function postJson(payload) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response
  let text
  try {
    response = await fetch(`${baseUrl}/api/argentina-market/benchmark`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    text = await response.text()
  } catch (error) {
    const reason = error?.name === 'AbortError'
      ? `timed out after ${REQUEST_TIMEOUT_MS}ms`
      : (error?.message || 'request failed')
    throw new Error(`argentina-market: request ${reason}`)
  } finally {
    clearTimeout(timeout)
  }

  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`argentina-market: non-JSON HTTP ${response.status}: ${String(text).slice(0, 500)}`)
  }
  if (!response.ok) {
    throw new Error(`argentina-market: HTTP ${response.status}: ${JSON.stringify(body).slice(0, 1200)}`)
  }
  return body
}

function safeResult(probe, body, policy) {
  return {
    id: probe.id,
    productName: probe.productName,
    status: body?.status,
    marketHealth: policy,
    providers: body?.providers,
    benchmark: {
      query: body?.query,
      source: body?.market?.source,
      rawCount: body?.market?.rawCount,
      comparableCount: body?.market?.comparableCount,
      effectivePriceCount: body?.market?.effectivePriceCount,
      suggestedPriceArs: body?.market?.suggestedPriceArs,
      confidence: body?.market?.confidence,
      priceQuality: body?.market?.priceQuality,
      warnings: body?.market?.warnings,
    },
  }
}

async function main() {
  const results = []
  for (const probe of probes) {
    const body = await postJson({ productName: probe.productName, category: probe.category })
    const policy = evaluateArgentinaMarketSmoke(body, {
      minComparables: MIN_COMPARABLES,
      requireDirectRetailer: true,
    })
    results.push(safeResult(probe, body, policy))
  }

  const healthy = results.filter((result) => result.marketHealth.healthy)
  const completionRate = healthy.length / results.length
  console.log(JSON.stringify({
    status: healthy.length ? 'ok' : 'fail',
    baseUrl,
    freeRetailerProof: {
      healthyProbes: healthy.length,
      totalProbes: results.length,
      completionRate,
      minimumComparables: MIN_COMPARABLES,
    },
    results,
  }, null, 2))

  if (!healthy.length) {
    throw new Error(`Free direct-retailer production gate failed: 0/${results.length} probes reached a live >=${MIN_COMPARABLES} benchmark.`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
