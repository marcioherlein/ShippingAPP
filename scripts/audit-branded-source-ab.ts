import { runArgentinaMarketBenchmark } from '../worker/marketBenchmarkEngine'
import {
  createArgentinaDirectRetailerProvider,
  DEFAULT_ARGENTINA_VTEX_RETAILERS,
  type ArgentinaVtexRetailer,
} from '../worker/vtexRetailerMarketProvider'

const additions: ArgentinaVtexRetailer[] = [
  {
    id: 'samsung-official',
    name: 'Samsung Shop Oficial',
    baseUrl: 'https://shop.samsung.com.ar',
    tradePolicy: '1',
    maxCandidates: 12,
  },
  {
    id: 'sony-official',
    name: 'Sony Store Oficial',
    baseUrl: 'https://store.sony.com.ar',
    tradePolicy: '1',
    maxCandidates: 12,
  },
]

const probes = [
  ['Samsung Galaxy A16 128GB 4GB', 'celular'],
  ['Samsung Galaxy S24 FE 256GB', 'celular'],
  ['Motorola G15 256GB 4GB', 'celular'],
  ['Motorola Moto G85 256GB', 'celular'],
  ['Apple iPhone 16 128GB', 'celular'],
  ['Xiaomi Redmi Note 14 256GB 8GB', 'celular'],
  ['Logitech MX Master 3S', 'mouse inalámbrico'],
  ['JBL Go 4', 'parlante bluetooth'],
  ['Sony WH-1000XM5', 'auriculares bluetooth'],
  ['TCL 55V6C 55 pulgadas', 'smart tv'],
  ['HP Smart Tank 580', 'impresora'],
  ['Lenovo IdeaPad Slim 3 15 8GB 512GB', 'notebook'],
] as const

async function run(retailers: ArgentinaVtexRetailer[]) {
  const provider = createArgentinaDirectRetailerProvider({ retailers, requestTimeoutMs: 5000 })
  const rows = []
  for (const [productName, category] of probes) {
    const started = Date.now()
    const result = await runArgentinaMarketBenchmark(productName, category, provider)
    rows.push({
      productName,
      category,
      status: result.status,
      accepted: result.comparableCount,
      raw: result.rawCount,
      source: result.source,
      durationMs: Date.now() - started,
      comparableIds: result.comparables.map((item) => item.id),
      comparableTitles: result.comparables.map((item) => item.title),
    })
  }
  return rows
}

const currentRetailers = [...DEFAULT_ARGENTINA_VTEX_RETAILERS]
const expandedRetailers = [...currentRetailers, ...additions]
const [current, expanded] = await Promise.all([run(currentRetailers), run(expandedRetailers)])

const comparisons = probes.map(([productName]) => {
  const a = current.find((row) => row.productName === productName)!
  const b = expanded.find((row) => row.productName === productName)!
  const newIds = b.comparableIds.filter((id) => id.startsWith('samsung-official:') || id.startsWith('sony-official:'))
  return {
    productName,
    currentStatus: a.status,
    expandedStatus: b.status,
    currentAccepted: a.accepted,
    expandedAccepted: b.accepted,
    acceptedDelta: b.accepted - a.accepted,
    newSourceAccepted: newIds.length,
    newSourceIds: newIds,
    currentDurationMs: a.durationMs,
    expandedDurationMs: b.durationMs,
  }
})

const summary = {
  total: probes.length,
  currentLive: current.filter((r) => r.status === 'live').length,
  expandedLive: expanded.filter((r) => r.status === 'live').length,
  expandedLowerAccepted: comparisons.filter((r) => r.expandedAccepted < r.currentAccepted).length,
  probesWithAcceptedNewSourceEvidence: comparisons.filter((r) => r.newSourceAccepted > 0).length,
  currentMeanDurationMs: Math.round(current.reduce((s, r) => s + r.durationMs, 0) / current.length),
  expandedMeanDurationMs: Math.round(expanded.reduce((s, r) => s + r.durationMs, 0) / expanded.length),
}

console.log(JSON.stringify({ status: 'branded_source_ab_complete', summary, comparisons, current, expanded }, null, 2))
if (summary.expandedLowerAccepted > 0) throw new Error('Expanded source set reduced accepted comparables in same-time A/B')
