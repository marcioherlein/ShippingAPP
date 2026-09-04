import { evaluateArgentinaMarketSmoke } from './argentina-market-smoke-policy.mjs'

const baseUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 25000)
const MIN_COMPARABLES = Number(process.env.ARGENTINA_MARKET_MIN_COMPARABLES || 5)

// Branded / exact-mode controls (existing)
const BRANDED_PROBES = [
  { id: 'logitech-m170', productName: 'Logitech M170', category: 'mouse inalámbrico' },
  { id: 'samsung-a16-128-4', productName: 'Samsung Galaxy A16 128GB 4GB', category: 'celular' },
  { id: 'motorola-g15-256-4', productName: 'Motorola G15 256GB 4GB', category: 'celular' },
]

// Generic commodity probes (Stream B) — these must reach a live benchmark via functional mode
// against Argentine retailers. Validates the language-bridge and commodity routing fixes.
const COMMODITY_PROBES = [
  { id: 'thermo-bottle-stainless', productName: '45oz 1350ml Large Capacity Stainless Steel Vacuum Bottle', category: 'stainless steel water bottle' },
  { id: 'sport-bottle-plastic', productName: 'Large Capacity Sport Water Bottle Gym Plastic', category: 'sport water bottle' },
  { id: 'sunglasses-uv400', productName: 'Mens Sunglasses Luxury Designer UV400 Polarized', category: 'sunglasses' },
  { id: 'tws-earbuds', productName: 'TWS Wireless Bluetooth Earbuds', category: 'wireless earphones' },
  { id: 'laptop-backpack', productName: 'Waterproof Laptop Backpack 30L', category: 'backpack' },
  { id: 'usbc-charger-65w', productName: 'USB-C Fast Charger 65W GaN', category: 'power adapter' },
  { id: 'bt-speaker', productName: 'Portable Bluetooth Speaker Waterproof', category: 'parlante bluetooth' },
  { id: 'running-sneakers', productName: 'Running Sport Shoes Breathable', category: 'zapatillas deportivas' },
]

const probes = [...BRANDED_PROBES, ...COMMODITY_PROBES]

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
  const commodityIds = new Set(COMMODITY_PROBES.map((p) => p.id))
  const healthyCommodity = healthy.filter((result) => commodityIds.has(result.id))
  const completionRate = healthy.length / results.length
  console.log(JSON.stringify({
    status: healthyCommodity.length === COMMODITY_PROBES.length ? 'ok' : 'fail',
    baseUrl,
    freeRetailerProof: {
      healthyProbes: healthy.length,
      healthyCommodityProbes: healthyCommodity.length,
      totalProbes: results.length,
      completionRate,
      minimumComparables: MIN_COMPARABLES,
    },
    results,
  }, null, 2))

  if (healthyCommodity.length < COMMODITY_PROBES.length) {
    throw new Error(`Generic-commodity production gate failed: ${healthyCommodity.length}/${COMMODITY_PROBES.length} commodity probes reached a live >=${MIN_COMPARABLES} benchmark.`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
