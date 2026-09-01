const baseUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'
const REQUEST_TIMEOUT_MS = Number(process.env.MIXED_AUDIT_TIMEOUT_MS || 30000)
const CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.MIXED_AUDIT_CONCURRENCY || 2)))
const MIN_COMPARABLES = 5

const probes = [
  // Exact / branded SKUs — 24
  { id: 'exact-samsung-a16', mode: 'exact', group: 'smartphones', productName: 'Samsung Galaxy A16 128GB 4GB', category: 'celular', must: [/samsung/i, /a16/i, /128\s*gb/i] },
  { id: 'exact-motorola-g15', mode: 'exact', group: 'smartphones', productName: 'Motorola G15 256GB 4GB', category: 'celular', must: [/motorola/i, /g15/i, /256\s*gb/i] },
  { id: 'exact-iphone16', mode: 'exact', group: 'smartphones', productName: 'Apple iPhone 16 128GB', category: 'celular', must: [/iphone\s*16/i, /128\s*gb/i], forbid: [/iphone\s*15/i, /\bpro\b/i, /\bplus\b/i] },
  { id: 'exact-redmi-note14', mode: 'exact', group: 'smartphones', productName: 'Xiaomi Redmi Note 14 256GB 8GB', category: 'celular', must: [/redmi/i, /note\s*14/i, /256\s*gb/i] },
  { id: 'exact-samsung-s24fe', mode: 'exact', group: 'smartphones', productName: 'Samsung Galaxy S24 FE 256GB', category: 'celular', must: [/s24\s*fe/i, /256\s*gb/i], forbid: [/s23/i, /s24\s*ultra/i] },
  { id: 'exact-motorola-g85', mode: 'exact', group: 'smartphones', productName: 'Motorola Moto G85 256GB', category: 'celular', must: [/g85/i, /256\s*gb/i] },

  { id: 'exact-logitech-m170', mode: 'exact', group: 'computing', productName: 'Logitech M170', category: 'mouse inalámbrico', must: [/logitech/i, /m170/i] },
  { id: 'exact-logitech-mx3s', mode: 'exact', group: 'computing', productName: 'Logitech MX Master 3S', category: 'mouse inalámbrico', must: [/mx\s*master\s*3s/i], forbid: [/mx\s*master\s*4/i] },
  { id: 'exact-hp-smarttank580', mode: 'exact', group: 'computing', productName: 'HP Smart Tank 580', category: 'impresora', must: [/hp/i, /580/i] },
  { id: 'exact-lenovo-slim3', mode: 'exact', group: 'computing', productName: 'Lenovo IdeaPad Slim 3 15 8GB 512GB', category: 'notebook', must: [/lenovo/i, /slim\s*3/i, /8\s*gb/i, /512\s*gb/i] },
  { id: 'exact-epson-l3250', mode: 'exact', group: 'computing', productName: 'Epson EcoTank L3250', category: 'impresora', must: [/epson/i, /l3250/i] },
  { id: 'exact-tplink-ax23', mode: 'exact', group: 'computing', productName: 'TP-Link Archer AX23', category: 'router wifi', must: [/tp.?link/i, /ax23/i] },

  { id: 'exact-jbl-go4', mode: 'exact', group: 'audio-tv', productName: 'JBL Go 4', category: 'parlante bluetooth', must: [/jbl/i, /go\s*4/i], forbid: [/go\s*3/i, /essential/i] },
  { id: 'exact-sony-xm5', mode: 'exact', group: 'audio-tv', productName: 'Sony WH-1000XM5', category: 'auriculares bluetooth', must: [/sony/i, /wh.?1000xm5/i], forbid: [/xm4/i] },
  { id: 'exact-tcl-55v6c', mode: 'exact', group: 'audio-tv', productName: 'TCL 55V6C 55 pulgadas', category: 'smart tv', must: [/tcl/i, /55v6c/i] },
  { id: 'exact-samsung-du7000', mode: 'exact', group: 'audio-tv', productName: 'Samsung 55DU7000 55 pulgadas', category: 'smart tv', must: [/samsung/i, /du7000/i] },

  { id: 'exact-philips-hd9252', mode: 'exact', group: 'appliances-tools-sports', productName: 'Philips Airfryer HD9252', category: 'freidora de aire', must: [/philips/i, /hd9252/i] },
  { id: 'exact-samsung-ww65', mode: 'exact', group: 'appliances-tools-sports', productName: 'Samsung WW65A4000EE 6.5kg', category: 'lavarropas', must: [/samsung/i, /ww65a4000ee/i] },
  { id: 'exact-samsung-rt38', mode: 'exact', group: 'appliances-tools-sports', productName: 'Samsung RT38K5932SL', category: 'heladera', must: [/samsung/i, /rt38k5932sl/i] },
  { id: 'exact-bosch-gsb13re', mode: 'exact', group: 'appliances-tools-sports', productName: 'Bosch GSB 13 RE 650W', category: 'taladro percutor', must: [/bosch/i, /gsb\s*13\s*re/i] },
  { id: 'exact-karcher-k2', mode: 'exact', group: 'appliances-tools-sports', productName: 'Karcher K2', category: 'hidrolavadora', must: [/karcher/i, /\bk2\b/i] },
  { id: 'exact-garmin-fr55', mode: 'exact', group: 'appliances-tools-sports', productName: 'Garmin Forerunner 55', category: 'reloj deportivo gps', must: [/garmin/i, /forerunner\s*55/i] },
  { id: 'exact-metalbone34', mode: 'exact', group: 'appliances-tools-sports', productName: 'Adidas Metalbone 3.4', category: 'paleta de padel', must: [/adidas/i, /metalbone/i, /3[.,]4/i], forbid: [/3[.,]5/i, /cross\s*it/i] },
  { id: 'exact-philips-hd9368', mode: 'exact', group: 'appliances-tools-sports', productName: 'Philips HD9368', category: 'pava eléctrica', must: [/philips/i, /hd9368/i] },

  // Functional / private-label style — 24
  { id: 'func-microwave20l', mode: 'functional', group: 'kitchen', productName: 'Microondas 20L sin marca', category: 'microondas', must: [/microondas/i, /20\s*(?:l|lt|litro)/i] },
  { id: 'func-kettle17l2200w', mode: 'functional', group: 'kitchen', productName: 'Pava electrica 1.7L 2200W sin marca', category: 'pava electrica', must: [/pava/i, /1[.,]7\s*(?:l|lt)/i, /2200\s*w/i] },
  { id: 'func-airfryer6l1700w', mode: 'functional', group: 'kitchen', productName: 'Freidora de aire 6L 1700W sin marca', category: 'freidora de aire', must: [/freidora|air\s*fryer/i, /6\s*(?:l|lt|litro)/i] },
  { id: 'func-blender15l600w', mode: 'functional', group: 'kitchen', productName: 'Licuadora 1.5L 600W sin marca', category: 'licuadora', must: [/licuadora/i, /1[.,]5\s*(?:l|lt)/i] },
  { id: 'func-toaster2slice800w', mode: 'functional', group: 'kitchen', productName: 'Tostadora 2 ranuras 800W sin marca', category: 'tostadora', must: [/tostadora/i, /2\s*(?:ranura|pan)/i] },
  { id: 'func-espresso15bar', mode: 'functional', group: 'kitchen', productName: 'Cafetera espresso 15 bar sin marca', category: 'cafetera espresso', must: [/cafetera|espresso/i, /15\s*bar/i] },

  { id: 'func-fan20in100w', mode: 'functional', group: 'home', productName: 'Ventilador 20 pulgadas 100W sin marca', category: 'ventilador', must: [/ventilador/i, /20\s*(?:pulg|["”″])/i, /100\s*w/i] },
  { id: 'func-waterheater80l', mode: 'functional', group: 'home', productName: 'Termotanque electrico 80 litros sin marca', category: 'termotanque', must: [/termotanque/i, /electr/i, /80\s*(?:l|lt|litro)/i], forbid: [/\bgas\b/i] },
  { id: 'func-washer65kg', mode: 'functional', group: 'home', productName: 'Lavarropas frontal 6.5kg sin marca', category: 'lavarropas', must: [/lavarropas/i, /6[.,]5\s*kg/i, /frontal/i], forbid: [/carga\s*superior/i, /semiautom/i] },
  { id: 'func-vacuum1800w', mode: 'functional', group: 'home', productName: 'Aspiradora sin bolsa 1800W sin marca', category: 'aspiradora', must: [/aspiradora/i, /1800\s*w/i], forbid: [/robot/i] },
  { id: 'func-hairdryer2200w', mode: 'functional', group: 'home', productName: 'Secador de pelo 2200W sin marca', category: 'secador de pelo', must: [/secador/i, /2200\s*w/i] },
  { id: 'func-iron2400w', mode: 'functional', group: 'home', productName: 'Plancha a vapor 2400W sin marca', category: 'plancha a vapor', must: [/plancha/i, /2400\s*w/i] },

  { id: 'func-tv55-4k', mode: 'functional', group: 'electronics', productName: 'Smart TV 55 pulgadas 4K sin marca', category: 'smart tv', must: [/smart/i, /55\s*(?:pulg|["”″])/i, /4k|ultra\s*hd|uhd/i] },
  { id: 'func-speaker20w', mode: 'functional', group: 'electronics', productName: 'Parlante Bluetooth 20W sin marca', category: 'parlante bluetooth', must: [/parlante|speaker/i, /bluetooth/i, /20\s*w/i] },
  { id: 'func-earbuds-anc', mode: 'functional', group: 'electronics', productName: 'Auriculares TWS Bluetooth con ANC sin marca', category: 'auriculares bluetooth', must: [/auricular|earbud/i, /bluetooth|tws/i, /anc|cancelaci/i] },
  { id: 'func-smartwatch-gps', mode: 'functional', group: 'electronics', productName: 'Smartwatch GPS 1.4 pulgadas sin marca', category: 'smartwatch', must: [/smartwatch|reloj/i, /gps/i, /1[.,]4\s*(?:pulg|["”″])/i] },
  { id: 'func-camera-wifi3mp', mode: 'functional', group: 'electronics', productName: 'Camara seguridad WiFi exterior 3MP sin marca', category: 'camara de seguridad', must: [/camara/i, /wifi|wi-fi/i, /3\s*mp/i] },
  { id: 'func-powerbank20k', mode: 'functional', group: 'electronics', productName: 'Power bank 20000mAh 22.5W sin marca', category: 'power bank', must: [/power\s*bank|bateria/i, /20000\s*mah/i] },

  { id: 'func-drill650w13mm', mode: 'functional', group: 'tools-sports', productName: 'Taladro percutor 650W 13mm sin marca', category: 'taladro percutor', must: [/taladro/i, /650\s*w/i, /13\s*mm/i] },
  { id: 'func-grinder115mm800w', mode: 'functional', group: 'tools-sports', productName: 'Amoladora angular 115mm 800W sin marca', category: 'amoladora', must: [/amoladora/i, /115\s*mm/i, /800\s*w/i] },
  { id: 'func-pressurewasher1400w', mode: 'functional', group: 'tools-sports', productName: 'Hidrolavadora 1400W sin marca', category: 'hidrolavadora', must: [/hidrolavadora/i, /1400\s*w/i] },
  { id: 'func-padel-carbon', mode: 'functional', group: 'tools-sports', productName: 'Paleta de padel carbono sin marca', category: 'paleta de padel', must: [/paleta/i, /padel|pádel/i, /carbon/i], forbid: [/fibra\s+de\s+vidrio/i] },
  { id: 'func-tennis-racket', mode: 'functional', group: 'tools-sports', productName: 'Raqueta de tenis grafito 300g sin marca', category: 'raqueta de tenis', must: [/raqueta/i, /tenis/i, /grafito|graphite/i, /300\s*g/i] },
  { id: 'func-dumbbell20kg', mode: 'functional', group: 'tools-sports', productName: 'Mancuerna ajustable 20kg sin marca', category: 'mancuerna', must: [/mancuerna/i, /20\s*kg/i, /ajust/i] },
]

const retailerPrefixes = {
  fravega: 'Frávega', cetrogar: 'Cetrogar', naldo: 'Naldo', oncity: 'OnCity', pardo: 'Pardo',
}

function acceptedContributors(comparables) {
  const found = new Set()
  for (const row of comparables) {
    const prefix = String(row?.id || '').split(':')[0].toLowerCase()
    if (retailerPrefixes[prefix]) found.add(retailerPrefixes[prefix])
  }
  return [...found]
}

function titleViolations(probe, comparables) {
  const violations = []
  for (const row of comparables) {
    const title = String(row?.title || '')
    for (const pattern of probe.must || []) {
      if (!pattern.test(title)) {
        violations.push({ id: row?.id, title, issue: `missing ${pattern}` })
        break
      }
    }
    for (const pattern of probe.forbid || []) {
      if (pattern.test(title)) violations.push({ id: row?.id, title, issue: `forbidden ${pattern}` })
    }
  }
  return violations
}

async function postBenchmark(probe) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const started = Date.now()
  try {
    const response = await fetch(`${baseUrl}/api/argentina-market/benchmark`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productName: probe.productName, category: probe.category }), signal: controller.signal,
    })
    const text = await response.text()
    let body
    try { body = JSON.parse(text) } catch { throw new Error(`non-JSON HTTP ${response.status}: ${text.slice(0, 300)}`) }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body).slice(0, 500)}`)
    const market = body?.market || {}
    const comparables = Array.isArray(market.comparables) ? market.comparables : []
    const violations = titleViolations(probe, comparables)
    const median = Number(market.medianArs) || null
    const p25 = Number(market.p25Ars) || null
    const p75 = Number(market.p75Ars) || null
    const dispersion = median && p25 != null && p75 != null ? (p75 - p25) / median : null
    return {
      ...probe, ok: true, actualMode: market.matchMode || null, status: market.status,
      modeCorrect: market.matchMode === probe.mode,
      rawCount: market.rawCount || 0, comparableCount: market.comparableCount || 0,
      p25Ars: p25, medianArs: median, p75Ars: p75, suggestedPriceArs: market.suggestedPriceArs || null,
      dispersionIqrOverMedian: dispersion, confidence: market.confidence || 0, source: market.source || '',
      contributors: acceptedContributors(comparables),
      comparableTitles: comparables.slice(0, 8).map((row) => row?.title).filter(Boolean),
      violations, apparentPrecisionPass: violations.length === 0,
      durationMs: Date.now() - started,
    }
  } catch (error) {
    return { ...probe, ok: false, actualMode: null, status: 'request_error', modeCorrect: false, rawCount: 0,
      comparableCount: 0, p25Ars: null, medianArs: null, p75Ars: null, suggestedPriceArs: null,
      dispersionIqrOverMedian: null, confidence: 0, source: '', contributors: [], comparableTitles: [], violations: [],
      apparentPrecisionPass: false, error: error?.name === 'AbortError' ? `timeout ${REQUEST_TIMEOUT_MS}ms` : (error?.message || String(error)),
      durationMs: Date.now() - started }
  } finally { clearTimeout(timeout) }
}

async function runPool(items, concurrency, fn) {
  const results = new Array(items.length); let index = 0
  async function worker() {
    while (true) {
      const current = index++
      if (current >= items.length) return
      results[current] = await fn(items[current])
      console.error(`[mixed-48] ${current + 1}/${items.length} ${items[current].id}: expected=${items[current].mode} actual=${results[current].actualMode} status=${results[current].status} comps=${results[current].comparableCount} violations=${results[current].violations.length}`)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return results
}

function summarize(rows) {
  const live = rows.filter((r) => r.status === 'live' && r.comparableCount >= MIN_COMPARABLES)
  const preciseLive = live.filter((r) => r.apparentPrecisionPass)
  const modeCorrect = rows.filter((r) => r.modeCorrect)
  return {
    total: rows.length, live: live.length, liveRate: rows.length ? live.length / rows.length : 0,
    preciseLive: preciseLive.length, preciseLiveRate: rows.length ? preciseLive.length / rows.length : 0,
    modeCorrect: modeCorrect.length, modeAccuracy: rows.length ? modeCorrect.length / rows.length : 0,
  }
}

async function main() {
  const results = await runPool(probes, CONCURRENCY, postBenchmark)
  const exact = results.filter((r) => r.mode === 'exact')
  const functional = results.filter((r) => r.mode === 'functional')
  const groups = Object.fromEntries([...new Set(results.map((r) => r.group))].map((group) => [group, summarize(results.filter((r) => r.group === group))]))
  const retailerAcceptedContribution = Object.fromEntries(Object.values(retailerPrefixes).map((name) => [name, results.filter((r) => r.contributors.includes(name)).length]))
  const requestErrors = results.filter((r) => !r.ok)
  const modeErrors = results.filter((r) => r.ok && !r.modeCorrect)
  const suspiciousLive = results.filter((r) => r.status === 'live' && r.comparableCount >= MIN_COMPARABLES && !r.apparentPrecisionPass)
  const report = {
    status: 'audit_complete', baseUrl, corpusSize: probes.length, minimumComparables: MIN_COMPARABLES, concurrency: CONCURRENCY,
    overall: summarize(results), exact: summarize(exact), functional: summarize(functional), groups,
    requestErrors: requestErrors.length, modeErrors: modeErrors.length, suspiciousLiveBenchmarks: suspiciousLive.length,
    retailerAcceptedContribution,
    highDispersionLive: results.filter((r) => r.status === 'live' && r.dispersionIqrOverMedian != null && r.dispersionIqrOverMedian > 0.6).map((r) => ({ id: r.id, dispersion: r.dispersionIqrOverMedian })),
    results,
  }
  console.log(JSON.stringify(report, null, 2))
  if (requestErrors.length === probes.length) throw new Error('All mixed-market audit requests failed; audit did not execute')
}

main().catch((error) => { console.error(error); process.exit(1) })
