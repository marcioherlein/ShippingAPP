const baseUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'
const REQUEST_TIMEOUT_MS = Number(process.env.COVERAGE_REQUEST_TIMEOUT_MS || 30000)
const CONCURRENCY = Math.max(1, Math.min(5, Number(process.env.COVERAGE_CONCURRENCY || 3)))
const MIN_COMPARABLES = 5
const RETAILERS = ['Frávega', 'Cetrogar', 'Naldo', 'OnCity', 'Pardo']

const probes = [
  { id: 'samsung-a16', group: 'smartphones', productName: 'Samsung Galaxy A16 128GB 4GB', category: 'celular' },
  { id: 'motorola-g15', group: 'smartphones', productName: 'Motorola G15 256GB 4GB', category: 'celular' },
  { id: 'iphone-16', group: 'smartphones', productName: 'Apple iPhone 16 128GB', category: 'celular' },
  { id: 'redmi-note-14', group: 'smartphones', productName: 'Xiaomi Redmi Note 14 256GB 8GB', category: 'celular' },
  { id: 'logitech-m170', group: 'computing', productName: 'Logitech M170', category: 'mouse inalámbrico' },
  { id: 'logitech-mx-master-3s', group: 'computing', productName: 'Logitech MX Master 3S', category: 'mouse inalámbrico' },
  { id: 'hp-smart-tank-580', group: 'computing', productName: 'HP Smart Tank 580', category: 'impresora' },
  { id: 'lenovo-ideapad-slim3', group: 'computing', productName: 'Lenovo IdeaPad Slim 3 15 8GB 512GB', category: 'notebook' },
  { id: 'jbl-go-4', group: 'audio', productName: 'JBL Go 4', category: 'parlante bluetooth' },
  { id: 'sony-wh1000xm5', group: 'audio', productName: 'Sony WH-1000XM5', category: 'auriculares bluetooth' },
  { id: 'tcl-55v6c', group: 'tv', productName: 'TCL 55V6C 55 pulgadas', category: 'smart tv' },
  { id: 'samsung-55du7000', group: 'tv', productName: 'Samsung 55DU7000 55 pulgadas', category: 'smart tv' },
  { id: 'philips-airfryer-hd9252', group: 'kitchen', productName: 'Philips Airfryer HD9252', category: 'freidora de aire' },
  { id: 'oster-bvstem7300', group: 'kitchen', productName: 'Oster BVSTEM7300', category: 'cafetera espresso' },
  { id: 'philips-hr2291', group: 'kitchen', productName: 'Philips HR2291', category: 'licuadora' },
  { id: 'whirlpool-wms20bs', group: 'kitchen', productName: 'Whirlpool WMS20BS', category: 'microondas' },
  { id: 'samsung-ww65', group: 'large-appliances', productName: 'Samsung WW65A4000EE 6.5kg', category: 'lavarropas' },
  { id: 'philco-phs32ha4cn', group: 'large-appliances', productName: 'Philco PHS32HA4CN 3400W', category: 'aire acondicionado' },
  { id: 'rheem-80l', group: 'large-appliances', productName: 'Rheem termotanque eléctrico 80 litros', category: 'termotanque' },
  { id: 'samsung-rt38', group: 'large-appliances', productName: 'Samsung RT38K5932SL', category: 'heladera' },
  { id: 'bosch-gsb13re', group: 'tools', productName: 'Bosch GSB 13 RE 650W', category: 'taladro percutor' },
  { id: 'blackdecker-g720', group: 'tools', productName: 'Black Decker G720 820W', category: 'amoladora' },
  { id: 'stanley-sdh600', group: 'tools', productName: 'Stanley SDH600 600W', category: 'taladro percutor' },
  { id: 'karcher-k2', group: 'tools', productName: 'Karcher K2', category: 'hidrolavadora' },
  { id: 'garmin-forerunner55', group: 'sports', productName: 'Garmin Forerunner 55', category: 'reloj deportivo gps' },
  { id: 'wilson-us-open', group: 'sports', productName: 'Wilson US Open pelota de tenis tubo 3', category: 'pelotas de tenis' },
  { id: 'adidas-padel-metalbone', group: 'sports', productName: 'Adidas Metalbone 3.4', category: 'paleta de padel' },
  { id: 'king-koil-ghybrid', group: 'home', productName: 'King Koil G-Hybrid 2 plazas 130x190', category: 'colchón' },
  { id: 'liliana-vtfm20', group: 'home', productName: 'Liliana VTFM20', category: 'ventilador' },
  { id: 'philips-hd9368', group: 'home', productName: 'Philips HD9368', category: 'pava eléctrica' },
]

async function postBenchmark(probe) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const started = Date.now()
  try {
    const response = await fetch(`${baseUrl}/api/argentina-market/benchmark`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productName: probe.productName, category: probe.category }),
      signal: controller.signal,
    })
    const text = await response.text()
    let body
    try {
      body = JSON.parse(text)
    } catch {
      throw new Error(`non-JSON HTTP ${response.status}: ${text.slice(0, 300)}`)
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body).slice(0, 500)}`)
    const market = body?.market || {}
    const source = String(market.source || '')
    const direct = source.includes('Retailers argentinos directos')
    const contributors = RETAILERS.filter((name) => source.includes(name))
    const comparableTitles = Array.isArray(market.comparables)
      ? market.comparables.slice(0, 5).map((item) => item?.title).filter(Boolean)
      : []
    return {
      ...probe,
      ok: true,
      status: market.status,
      direct,
      contributors,
      rawCount: market.rawCount || 0,
      comparableCount: market.comparableCount || 0,
      suggestedPriceArs: market.suggestedPriceArs || null,
      confidence: market.confidence || 0,
      source,
      comparableTitles,
      durationMs: Date.now() - started,
    }
  } catch (error) {
    return {
      ...probe,
      ok: false,
      status: 'request_error',
      direct: false,
      contributors: [],
      rawCount: 0,
      comparableCount: 0,
      suggestedPriceArs: null,
      confidence: 0,
      source: '',
      comparableTitles: [],
      error: error?.name === 'AbortError' ? `timeout ${REQUEST_TIMEOUT_MS}ms` : (error?.message || String(error)),
      durationMs: Date.now() - started,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function runPool(items, concurrency, fn) {
  const results = new Array(items.length)
  let index = 0
  async function worker() {
    while (true) {
      const current = index++
      if (current >= items.length) return
      results[current] = await fn(items[current])
      console.error(`[coverage] ${current + 1}/${items.length} ${items[current].id}: ${results[current].status} comparables=${results[current].comparableCount} source=${results[current].source}`)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return results
}

function groupSummary(results) {
  const groups = [...new Set(results.map((result) => result.group))]
  return Object.fromEntries(groups.map((group) => {
    const rows = results.filter((result) => result.group === group)
    const live = rows.filter((result) => result.status === 'live' && result.comparableCount >= MIN_COMPARABLES)
    const direct = live.filter((result) => result.direct)
    return [group, {
      total: rows.length,
      live: live.length,
      directLive: direct.length,
      liveRate: rows.length ? live.length / rows.length : 0,
    }]
  }))
}

async function main() {
  const results = await runPool(probes, CONCURRENCY, postBenchmark)
  const live = results.filter((result) => result.status === 'live' && result.comparableCount >= MIN_COMPARABLES)
  const directLive = live.filter((result) => result.direct)
  const errors = results.filter((result) => !result.ok)
  const retailerContribution = Object.fromEntries(RETAILERS.map((name) => [
    name,
    results.filter((result) => result.contributors.includes(name)).length,
  ]))
  const report = {
    status: 'audit_complete',
    baseUrl,
    corpusSize: probes.length,
    minimumComparables: MIN_COMPARABLES,
    concurrency: CONCURRENCY,
    liveBenchmarks: live.length,
    liveCompletionRate: live.length / probes.length,
    directRetailerLiveBenchmarks: directLive.length,
    directRetailerCompletionRate: directLive.length / probes.length,
    requestErrors: errors.length,
    retailerContribution,
    groups: groupSummary(results),
    results,
  }
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
