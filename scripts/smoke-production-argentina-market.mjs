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

function fail(message, body) {
  throw new Error(`${message}: ${JSON.stringify(body).slice(0, 2200)}`)
}

async function main() {
  const body = await postJson('/api/argentina-market/benchmark', {
    productName: 'Logitech MX Master 3S',
    category: 'mouse inalámbrico',
  })

  if (REQUIRE_GOOGLE && body.providers?.googleShoppingConfigured !== true) {
    fail('Argentina market production gate requires Google Shopping but SERPAPI_API_KEY is not configured in the Worker', body)
  }

  if (body.status !== 'live' || body.market?.status !== 'live') {
    fail(`Argentina market benchmark is not live (status=${body.status || 'missing'})`, body)
  }
  if ((body.market?.comparableCount || 0) < MIN_COMPARABLES) {
    fail(`Argentina market benchmark has fewer than ${MIN_COMPARABLES} accepted comparables`, body)
  }
  if (!(body.market?.suggestedPriceArs > 0)) {
    fail('Argentina market benchmark has no positive suggestedPriceArs', body)
  }
  if (!body.market?.source) {
    fail('Argentina market benchmark is missing source traceability', body)
  }
  if (!Array.isArray(body.market?.comparables) || body.market.comparables.length < MIN_COMPARABLES) {
    fail('Argentina market benchmark does not expose enough traceable comparables', body)
  }

  const unsafe = JSON.stringify(body).toLowerCase()
  if (unsafe.includes('serpapi_api_key') || unsafe.includes('authorization: bearer')) {
    fail('Argentina market response appears to leak provider credential metadata', body)
  }

  console.log(JSON.stringify({
    status: 'ok',
    baseUrl,
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
