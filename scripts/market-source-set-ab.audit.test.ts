import { describe, expect, it } from 'vitest'
import { runArgentinaMarketBenchmark } from '../worker/marketBenchmarkEngine'
import { withFunctionalTraitEvidenceGuard } from '../worker/functionalTraitEvidence'
import { withProgressiveFunctionalDiscovery } from '../worker/progressiveFunctionalDiscovery'
import {
  createArgentinaDirectRetailerProvider,
  DEFAULT_ARGENTINA_VTEX_RETAILERS,
} from '../worker/vtexRetailerMarketProvider'

const LEGACY_IDS = new Set(['fravega', 'cetrogar', 'naldo', 'oncity', 'pardo'])
const legacy5 = DEFAULT_ARGENTINA_VTEX_RETAILERS.filter((r) => LEGACY_IDS.has(r.id))
const expanded9 = [...DEFAULT_ARGENTINA_VTEX_RETAILERS]

const probes = [
  ['exact-samsung-a16', 'Samsung Galaxy A16 128GB 4GB', 'celular'],
  ['exact-iphone16', 'Apple iPhone 16 128GB', 'celular'],
  ['exact-redmi-note14', 'Xiaomi Redmi Note 14 256GB 8GB', 'celular'],
  ['exact-logitech-m170', 'Logitech M170', 'mouse inalámbrico'],
  ['exact-logitech-mx3s', 'Logitech MX Master 3S', 'mouse inalámbrico'],
  ['exact-hp-smarttank580', 'HP Smart Tank 580', 'impresora'],
  ['exact-lenovo-slim3', 'Lenovo IdeaPad Slim 3 15 8GB 512GB', 'notebook'],
  ['exact-jbl-go4', 'JBL Go 4', 'parlante bluetooth'],
  ['exact-sony-xm5', 'Sony WH-1000XM5', 'auriculares bluetooth'],
  ['exact-tcl-55v6c', 'TCL 55V6C 55 pulgadas', 'smart tv'],
  ['exact-samsung-ww65', 'Samsung WW65A4000EE 6.5kg', 'lavarropas'],
  ['exact-karcher-k2', 'Karcher K2', 'hidrolavadora'],
  ['exact-garmin-fr55', 'Garmin Forerunner 55', 'reloj deportivo gps'],
  ['func-microwave20l', 'Microondas 20L sin marca', 'microondas'],
  ['func-kettle17l2200w', 'Pava electrica 1.7L 2200W sin marca', 'pava electrica'],
  ['func-fan20in100w', 'Ventilador 20 pulgadas 100W sin marca', 'ventilador'],
  ['func-waterheater80l', 'Termotanque electrico 80 litros sin marca', 'termotanque'],
  ['func-washer65kg', 'Lavarropas frontal 6.5kg sin marca', 'lavarropas'],
  ['func-tv55-4k', 'Smart TV 55 pulgadas 4K sin marca', 'smart tv'],
  ['func-earbuds-anc', 'Auriculares TWS Bluetooth con ANC sin marca', 'auriculares bluetooth'],
  ['func-camera-wifi3mp', 'Camara seguridad WiFi exterior 3MP sin marca', 'camara de seguridad'],
  ['func-drill650w13mm', 'Taladro percutor 650W 13mm sin marca', 'taladro percutor'],
  ['func-pressurewasher1400w', 'Hidrolavadora 1400W sin marca', 'hidrolavadora'],
  ['func-padel-carbon', 'Paleta de padel carbono sin marca', 'paleta de padel'],
] as const

function provider(retailers: typeof expanded9) {
  return withProgressiveFunctionalDiscovery(withFunctionalTraitEvidenceGuard(
    createArgentinaDirectRetailerProvider({ retailers, requestTimeoutMs: 5000 }),
  ))
}

async function runOne(retailers: typeof expanded9, productName: string, category: string) {
  const started = Date.now()
  const result = await runArgentinaMarketBenchmark(productName, category, provider(retailers))
  return {
    status: result.status,
    raw: result.rawCount,
    accepted: result.comparableCount,
    durationMs: Date.now() - started,
    source: result.source,
    ids: result.comparables.map((row) => row.id),
  }
}

async function sourceHealth() {
  const output = []
  for (const retailer of expanded9) {
    const started = Date.now()
    try {
      const result = await createArgentinaDirectRetailerProvider({
        retailers: [retailer],
        requestTimeoutMs: 5000,
      }).discover({
        query: 'logitech m170',
        productName: 'Logitech M170',
        category: 'mouse inalámbrico',
      })
      output.push({
        id: retailer.id,
        candidates: result.candidates.length,
        durationMs: Date.now() - started,
        warningCount: result.warnings?.length || 0,
      })
    } catch (error) {
      output.push({
        id: retailer.id,
        candidates: 0,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return output
}

describe('same-time Argentina market source-set A/B', () => {
  it('compares legacy five vs expanded nine without changing matcher semantics', async () => {
    const health = await sourceHealth()
    const rows = []
    let legacyLive = 0
    let expandedLive = 0
    let expandedLowerAccepted = 0
    let newSourceAccepted = 0

    for (const [id, productName, category] of probes) {
      // Alternate ordering by row so one source set is not always advantaged by being first.
      const expandedFirst = rows.length % 2 === 1
      const first = expandedFirst
        ? await runOne(expanded9, productName, category)
        : await runOne(legacy5, productName, category)
      const second = expandedFirst
        ? await runOne(legacy5, productName, category)
        : await runOne(expanded9, productName, category)
      const legacy = expandedFirst ? second : first
      const expanded = expandedFirst ? first : second

      if (legacy.status === 'live') legacyLive += 1
      if (expanded.status === 'live') expandedLive += 1
      if (expanded.accepted < legacy.accepted) expandedLowerAccepted += 1
      const newIds = expanded.ids.filter((candidateId) => /^(easy|coppel|carrefour|sportline):/i.test(candidateId))
      if (newIds.length) newSourceAccepted += 1

      rows.push({
        id,
        legacy: { status: legacy.status, raw: legacy.raw, accepted: legacy.accepted, durationMs: legacy.durationMs },
        expanded: { status: expanded.status, raw: expanded.raw, accepted: expanded.accepted, durationMs: expanded.durationMs },
        deltaAccepted: expanded.accepted - legacy.accepted,
        newSourceAccepted: newIds.length,
      })
    }

    const report = {
      status: 'source_set_ab_complete',
      probeCount: probes.length,
      sourceHealth: health,
      legacy5: {
        live: legacyLive,
        liveRate: legacyLive / probes.length,
        meanDurationMs: Math.round(rows.reduce((sum, row) => sum + row.legacy.durationMs, 0) / rows.length),
      },
      expanded9: {
        live: expandedLive,
        liveRate: expandedLive / probes.length,
        meanDurationMs: Math.round(rows.reduce((sum, row) => sum + row.expanded.durationMs, 0) / rows.length),
      },
      expandedLowerAccepted,
      probesWithAcceptedNewSourceEvidence: newSourceAccepted,
      rows,
    }

    console.log(`SOURCE_SET_AB_REPORT=${JSON.stringify(report)}`)

    expect(legacy5).toHaveLength(5)
    expect(expanded9).toHaveLength(9)
    expect(rows).toHaveLength(probes.length)
  }, 300_000)
})
