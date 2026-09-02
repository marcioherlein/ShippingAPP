const baseUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'
const timeoutMs = Number(process.env.GAP_AUDIT_TIMEOUT_MS || 30000)

const probes = [
  ['airfryer-6l-1700w', 'Freidora de aire 6L 1700W sin marca', 'freidora de aire'],
  ['vacuum-1800w-bagless', 'Aspiradora sin bolsa 1800W sin marca', 'aspiradora'],
  ['smartwatch-gps-14', 'Smartwatch GPS 1.4 pulgadas sin marca', 'smartwatch'],
  ['powerbank-20k-225w', 'Power bank 20000mAh 22.5W sin marca', 'power bank'],
  ['tennis-graphite-300g', 'Raqueta de tenis grafito 300g sin marca', 'raqueta de tenis'],
  ['dumbbell-adjustable-20kg', 'Mancuerna ajustable 20kg sin marca', 'mancuerna'],
]

async function probe([id, productName, category]) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const response = await fetch(`${baseUrl}/api/argentina-market/benchmark`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productName, category }),
      signal: controller.signal,
    })
    const body = await response.json()
    const market = body?.market || body || {}
    return {
      id,
      httpStatus: response.status,
      status: market.status || null,
      matchMode: market.matchMode || null,
      query: market.query || null,
      rawCount: market.rawCount || 0,
      comparableCount: market.comparableCount || 0,
      source: market.source || null,
      warnings: market.warnings || [],
      comparables: (market.comparables || []).map((row) => ({
        id: row.id,
        title: row.title,
        priceArs: row.priceArs,
        score: row.score,
        reason: row.reason,
      })),
      durationMs: Date.now() - started,
    }
  } catch (error) {
    return {
      id,
      status: 'request_error',
      error: error?.name === 'AbortError' ? `timeout ${timeoutMs}ms` : (error?.message || String(error)),
      durationMs: Date.now() - started,
    }
  } finally {
    clearTimeout(timeout)
  }
}

const results = []
for (const item of probes) results.push(await probe(item))

const summary = {
  status: 'functional_gap_audit_complete',
  baseUrl,
  total: results.length,
  live: results.filter((row) => row.status === 'live').length,
  zeroRaw: results.filter((row) => row.rawCount === 0).map((row) => row.id),
  nearLive: results.filter((row) => row.status !== 'live' && row.comparableCount > 0).map((row) => ({ id: row.id, comparableCount: row.comparableCount })),
  results,
}

console.log(JSON.stringify(summary, null, 2))
