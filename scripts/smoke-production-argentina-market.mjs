import { evaluateArgentinaMarketSmoke } from './argentina-market-smoke-policy.mjs'

const baseUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 25000)
const MIN_COMPARABLES = Number(process.env.ARGENTINA_MARKET_MIN_COMPARABLES || 5)
const REQUIRE_GOOGLE = process.env.REQUIRE_GOOGLE_SHOPPING === '1'

async function postJson(path, payload) {
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
    const reason = error?.name === 'AbortError'
      ? `timed out after ${REQUEST_TIMEOUT_MS}ms`
      : (error?.message || 'request failed')
    throw new Error(`argentina-market: ${path} ${reason}`)
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

async function main() {
  const body = await postJson('/api/argentina-market/benchmark', {
    productName: 'Logitech MX Master 3S',
    category: 'mouse inalámbrico',
  })

  const policy = evaluateArgentinaMarketSmoke(body, {
    minComparables: MIN_COMPARABLES,
    requireGoogle: REQUIRE_GOOGLE,
  })
  if (!policy.healthy) {
    const failed = policy.checks
      .filter((check) => check.applicable && !check.passed)
      .map((check) => check.name)
    throw new Error(`Argentina market production gate failed (${Math.round(policy.successRate * 100)}% checks passed); failed: ${failed.join(', ')}; evidence=${JSON.stringify(body).slice(0, 2200)}`)
  }

  const unsafe = JSON.stringify(body).toLowerCase()
  if (unsafe.includes('serpapi_api_key') || unsafe.includes('authorization: bearer')) {
    throw new Error(`Argentina market response appears to leak provider credential metadata: ${JSON.stringify(body).slice(0, 2200)}`)
  }

  console.log(JSON.stringify({
    status: 'ok',
    baseUrl,
    marketHealth: policy,
    providers: body.providers,
    benchmark: {
      query: body.query,
      source: body.market.source,
      comparableCount: body.market.comparableCount,
      effectivePriceCount: body.market.effectivePriceCount,
      suggestedPriceArs: body.market.suggestedPriceArs,
      confidence: body.market.confidence,
      priceQuality: body.market.priceQuality,
    },
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
