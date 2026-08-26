const baseUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 20000)

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

async function main() {
  const status = await getJson('/api/mercadolibre/status', 'meli-status')
  if (!status.auth?.ready) {
    console.log(JSON.stringify({ status: 'skipped', reason: 'MercadoLibre auth is not configured in this environment', auth: status.auth }, null, 2))
    return
  }
  if (status.auth?.apiReady === false) {
    console.log(JSON.stringify({
      status: 'skipped',
      reason: 'MercadoLibre temporary token is loaded but not currently API-ready. This is expected when MERCADOLIBRE_ACCESS_TOKEN expires; production should migrate to refresh_token + KV.',
      auth: {
        ready: status.auth.ready,
        apiReady: status.auth.apiReady,
        tokenSource: status.auth.tokenSource,
        apiAccess: status.auth.apiAccess,
      },
    }, null, 2))
    return
  }

  const benchmark = await postJson('/api/mercadolibre/benchmark', {
    productName: 'Paleta de pádel carbono EVA',
    category: 'Padel racket',
  }, 'meli-benchmark')

  const allText = textOf(benchmark)
  if (allText.includes('Mercado Libre API 403')) {
    throw new Error(`meli-benchmark: benchmark still reports 403: ${allText.slice(0, 2000)}`)
  }
  if (benchmark.status === 'unavailable' || benchmark.market?.status === 'unavailable') {
    console.log(JSON.stringify({ status: 'degraded', reason: 'MercadoLibre benchmark unavailable; app must not fabricate comparables.', benchmark: benchmark.market }, null, 2))
    return
  }
  if (!['live', 'insufficient'].includes(benchmark.status)) {
    throw new Error(`meli-benchmark: unexpected status ${benchmark.status}: ${allText.slice(0, 2000)}`)
  }
  if (benchmark.status === 'live' && (!benchmark.market?.suggestedPriceArs || benchmark.market.suggestedPriceArs <= 0)) {
    throw new Error(`meli-benchmark: live benchmark without suggestedPriceArs: ${allText.slice(0, 2000)}`)
  }

  console.log(JSON.stringify({
    status: 'ok',
    baseUrl,
    auth: {
      ready: status.auth.ready,
      apiReady: status.auth.apiReady,
      tokenSource: status.auth.tokenSource,
      apiAccess: status.auth.apiAccess,
    },
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