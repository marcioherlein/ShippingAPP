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
  if (body?.status !== 'ready') fail(`expected intake status ready, got ${body?.status ?? 'missing'}`, body)

  const analysis = body?.analysis
  const market = analysis?.market
  const details = market?.details
  const source = String(market?.source || '')
  const assumptions = Array.isArray(analysis?.assumptions) ? analysis.assumptions.map(String) : []

  if (!analysis?.product) fail('missing analysis.product', body)
  if (details?.status !== 'live') fail(`expected hybrid market live, got ${details?.status ?? 'missing'}`, body)
  if (!source.includes('Retailers argentinos directos')) fail(`expected direct-retailer source, got ${source || 'missing'}`, body)
  if (!(Number(details?.comparableCount || 0) >= MIN_COMPARABLES)) {
    fail(`expected >=${MIN_COMPARABLES} accepted comparables, got ${details?.comparableCount ?? 'missing'}`, body)
  }
  if (!(Number(market?.estimatedPriceArs || 0) > 0)) fail('missing positive estimatedPriceArs', body)
  if (!String(analysis?.confidence?.market || '').startsWith('live-')) fail('market confidence is not live', body)
  if (!Array.isArray(details?.comparables) || details.comparables.length < MIN_COMPARABLES) {
    fail(`expected >=${MIN_COMPARABLES} traceable comparable rows`, body)
  }

  const staleAssumptions = assumptions.filter((value) => {
    const normalized = value.toLowerCase()
    return normalized.includes('mercado local bloqueado')
      || normalized.includes('mercado local no confirmado')
      || normalized.includes('comparables activos de mercado libre')
  })
  if (staleAssumptions.length) fail(`stale ML-only assumptions leaked: ${staleAssumptions.join(' | ')}`, body)

  const priceDelta = Math.abs(Number(market.estimatedPriceArs) - Number(details.suggestedPriceArs))
  if (!Number.isFinite(priceDelta) || priceDelta > 1) {
    fail(`user-facing price diverges from authoritative hybrid suggested price (${market.estimatedPriceArs} vs ${details?.suggestedPriceArs})`, body)
  }

  console.log(JSON.stringify({
    status: 'ok',
    route: '/api/intake',
    intakeStatus: body.status,
    product: {
      name: analysis.product.name,
      category: analysis.product.category,
    },
    market: {
      status: details.status,
      source,
      rawCount: details.rawCount,
      comparableCount: details.comparableCount,
      estimatedPriceArs: market.estimatedPriceArs,
      suggestedPriceArs: details.suggestedPriceArs,
      confidence: analysis.confidence.market,
      traceableComparables: details.comparables.length,
    },
    staleMlOnlyAssumptions: staleAssumptions.length,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
