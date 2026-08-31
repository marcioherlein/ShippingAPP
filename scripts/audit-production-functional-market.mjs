const baseUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'
const REQUEST_TIMEOUT_MS = Number(process.env.FUNCTIONAL_SMOKE_TIMEOUT_MS || 30000)
const MIN_COMPARABLES = 5

const probes = [
  { id: 'exact-iphone16', expectedMode: 'exact', productName: 'Apple iPhone 16 128GB', category: 'celular' },
  { id: 'functional-microwave-20l', expectedMode: 'functional', productName: 'Microondas 20L sin marca', category: 'microondas' },
  { id: 'functional-kettle-17l', expectedMode: 'functional', productName: 'Pava electrica 1.7L 2200W sin marca', category: 'pava electrica' },
  { id: 'functional-fan-20in', expectedMode: 'functional', productName: 'Ventilador 20 pulgadas 100W sin marca', category: 'ventilador' },
  { id: 'functional-water-heater-80l', expectedMode: 'functional', productName: 'Termotanque electrico 80 litros sin marca', category: 'termotanque' },
  { id: 'functional-washer-65kg', expectedMode: 'functional', productName: 'Lavarropas frontal 6.5kg sin marca', category: 'lavarropas' },
  { id: 'functional-tv-55', expectedMode: 'functional', productName: 'Smart TV 55 pulgadas 4K sin marca', category: 'smart tv' },
  { id: 'functional-carbon-padel', expectedMode: 'functional', productName: 'Paleta de padel carbono sin marca', category: 'paleta de padel' },
]

async function postBenchmark(probe) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${baseUrl}/api/argentina-market/benchmark`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productName: probe.productName, category: probe.category }),
      signal: controller.signal,
    })
    const text = await response.text()
    let body
    try { body = JSON.parse(text) } catch { throw new Error(`${probe.id}: non-JSON HTTP ${response.status}: ${text.slice(0, 300)}`) }
    if (!response.ok) throw new Error(`${probe.id}: HTTP ${response.status}: ${JSON.stringify(body).slice(0, 700)}`)
    return body
  } finally {
    clearTimeout(timeout)
  }
}

function inspect(probe, body) {
  const market = body?.market || {}
  const comparables = Array.isArray(market.comparables) ? market.comparables : []
  const failures = []

  if (market.matchMode !== probe.expectedMode) failures.push(`expected mode ${probe.expectedMode}, got ${market.matchMode}`)
  if (market.status === 'live' && (market.comparableCount || 0) < MIN_COMPARABLES) failures.push('live result below minimum comparable floor')
  if (market.status === 'live' && !(market.suggestedPriceArs > 0)) failures.push('live result missing positive ARS price')
  if (market.status === 'live' && comparables.length === 0) failures.push('live result missing traceable comparables')

  if (probe.expectedMode === 'functional') {
    const warnings = Array.isArray(market.warnings) ? market.warnings.join(' ') : ''
    if (!warnings.includes('functional-equivalent matching')) failures.push('functional disclosure warning missing')
    if (comparables.some((row) => !String(row?.reason || '').includes('functional'))) failures.push('functional result contains non-functional comparable reason')
    if (market.confidence > 80) failures.push(`functional confidence exceeds cap: ${market.confidence}`)
  }

  if (probe.id === 'exact-iphone16') {
    if (comparables.some((row) => /iphone\s*15\b/i.test(String(row?.title || '')))) failures.push('iPhone 15 leaked into exact iPhone 16 benchmark')
    if (comparables.some((row) => /\bpro\b|\bplus\b/i.test(String(row?.title || '')))) failures.push('variant leaked into exact base iPhone benchmark')
  }

  if (probe.id === 'functional-water-heater-80l' && comparables.some((row) => /\bgas\b/i.test(String(row?.title || '')))) {
    failures.push('gas water heater leaked into electric functional benchmark')
  }
  if (probe.id === 'functional-carbon-padel' && comparables.some((row) => /fibra\s+de\s+vidrio|fiberglass/i.test(String(row?.title || '')) && !/carbon/i.test(String(row?.title || '')))) {
    failures.push('fiberglass-only racket leaked into carbon functional benchmark')
  }

  return {
    id: probe.id,
    expectedMode: probe.expectedMode,
    actualMode: market.matchMode,
    status: market.status,
    query: market.query,
    source: market.source,
    comparableCount: market.comparableCount || 0,
    suggestedPriceArs: market.suggestedPriceArs || null,
    confidence: market.confidence || 0,
    comparableTitles: comparables.slice(0, 8).map((row) => row?.title).filter(Boolean),
    comparableIds: comparables.slice(0, 8).map((row) => row?.id).filter(Boolean),
    failures,
  }
}

async function main() {
  const results = []
  for (const probe of probes) {
    const body = await postBenchmark(probe)
    const result = inspect(probe, body)
    results.push(result)
    console.error(`[functional-smoke] ${probe.id}: mode=${result.actualMode} status=${result.status} comparables=${result.comparableCount}`)
  }

  const exact = results.find((row) => row.id === 'exact-iphone16')
  const functional = results.filter((row) => row.expectedMode === 'functional')
  const functionalLive = functional.filter((row) => row.status === 'live' && row.comparableCount >= MIN_COMPARABLES)
  const failures = results.flatMap((row) => row.failures.map((failure) => `${row.id}: ${failure}`))

  if (!exact || exact.actualMode !== 'exact') failures.push('exact branded control did not remain exact')
  if (!functional.every((row) => row.actualMode === 'functional')) failures.push('one or more generic probes did not route to functional mode')
  if (functionalLive.length === 0) failures.push('no generic/private-label probe achieved a live >=5 functional benchmark')

  const report = {
    status: failures.length ? 'fail' : 'ok',
    baseUrl,
    minimumComparables: MIN_COMPARABLES,
    functionalProbeCount: functional.length,
    functionalLiveCount: functionalLive.length,
    functionalLiveRate: functional.length ? functionalLive.length / functional.length : 0,
    failures,
    results,
  }
  console.log(JSON.stringify(report, null, 2))
  if (failures.length) throw new Error(`Functional production smoke failed: ${failures.join('; ')}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
