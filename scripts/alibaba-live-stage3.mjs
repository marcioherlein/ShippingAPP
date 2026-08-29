const BASE = process.env.SHIPPINGAPP_BASE_URL || 'https://shippingapp.marciofabrizio.workers.dev'

const cases = [
  {
    id: 'mechanical-watch',
    url: 'https://www.alibaba.com/product-detail/Fully-Automatic-Mechanical-Watches-42-5MM_1601666174891.html',
    identity: ['watch', 'wristwatch', 'mechanical'],
  },
  {
    id: 'portable-blender-530ml',
    url: 'https://www.alibaba.com/product-detail/USB-Portable-530ml-Rechargeable-Smoothie-Blender_1600604306778.html',
    identity: ['blender', 'smoothie', 'juicer'],
  },
  {
    id: 'portable-blender-smart',
    url: 'https://www.alibaba.com/product-detail/Home-Smart-Application-Mini-Personal-Electric_1601169598680.html',
    identity: ['blender', 'juicer', 'mixer'],
  },
  {
    id: 'portable-blender-mini',
    url: 'https://www.alibaba.com/product-detail/USB-Mini-Blender-Easy-Use-Portable_1601257014880.html',
    identity: ['blender', 'juicer', 'mixer'],
  },
  {
    id: 'led-beauty-mask',
    url: 'https://www.alibaba.com/product-detail/led-mask-hydrogen-facial-machine-with_1600831905079.html',
    identity: ['mask', 'facial', 'beauty', 'led'],
  },
  {
    id: 'led-red-light-mask',
    url: 'https://www.alibaba.com/product-detail/2024-Led-Face-Facial-Mask-Near_1601337996423.html',
    identity: ['mask', 'face', 'facial', 'led'],
  },
  {
    id: 'mini-projector',
    url: 'https://www.alibaba.com/product-detail/New-Mini-Projector-1080p-Android-Projector_1600085395567.html',
    identity: ['projector'],
  },
  {
    id: 'pet-grooming-vacuum',
    url: 'https://www.alibaba.com/product-detail/Professional-5-in-1-Pet-Grooming_1601639450533.html',
    identity: ['groom', 'vacuum', 'pet'],
  },
  {
    id: 'wifi-doorbell',
    url: 'https://www.alibaba.com/product-detail/High-Quality-Tuya-Smartlife-Wireless-Wifi_1600667679915.html',
    identity: ['doorbell', 'door bell', 'wifi', 'wireless'],
  },
]

function meaningful(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0
  return typeof value === 'string' && value.trim().length > 0
}

function fichaSignals(facts) {
  if (!facts) return 0
  return [
    facts.name,
    facts.category,
    facts.unitPriceUsd,
    facts.moq,
    facts.packedWeightKg,
    facts.volumeCbm,
    facts.originCountry,
  ].filter(meaningful).length
}

function identityPass(test, facts) {
  const haystack = [facts?.name, facts?.category, ...(facts?.categoryPath || [])].filter(Boolean).join(' ').toLowerCase()
  return test.identity.some((token) => haystack.includes(token.toLowerCase()))
}

async function post(path, url, timeoutMs = 60000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    })
    const elapsedMs = Date.now() - started
    const text = await response.text()
    let body = null
    try { body = JSON.parse(text) } catch { body = { raw: text.slice(0, 500) } }
    return { http: response.status, elapsedMs, body }
  } catch (error) {
    return { http: null, elapsedMs: Date.now() - started, body: null, error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

const rows = []
let browserCalls = 0
for (const test of cases) {
  const direct = await post('/api/alibaba-direct-probe', test.url, 45000)
  const directFacts = direct.body?.facts || null
  const directSignals = fichaSignals(directFacts)
  const directIdentity = identityPass(test, directFacts)
  let browser = null
  let browserSignals = 0
  let browserIdentity = false

  if (!(directIdentity && directSignals === 7) && browserCalls < 6) {
    browserCalls += 1
    browser = await post('/api/alibaba-native-probe', test.url, 90000)
    const browserFacts = browser.body?.facts || null
    browserSignals = fichaSignals(browserFacts)
    browserIdentity = identityPass(test, browserFacts)
  }

  const automaticIdentity = directIdentity || browserIdentity
  const automaticComplete = (directIdentity && directSignals === 7) || (browserIdentity && browserSignals === 7)
  const source = directIdentity && directSignals === 7 ? 'direct' : browserIdentity && browserSignals === 7 ? 'browser' : automaticIdentity ? 'user_confirmation' : 'identity_failed'

  rows.push({
    id: test.id,
    direct: {
      http: direct.http,
      status: direct.body?.status || null,
      elapsedMs: direct.elapsedMs,
      identity: directIdentity,
      signals: directSignals,
      name: directFacts?.name || null,
      category: directFacts?.category || null,
      price: directFacts?.unitPriceUsd ?? null,
      moq: directFacts?.moq ?? null,
      weight: directFacts?.packedWeightKg ?? null,
      volume: directFacts?.volumeCbm ?? null,
      origin: directFacts?.originCountry ?? null,
      hs: directFacts?.hsCode ?? null,
      warnings: direct.body?.warnings || (direct.error ? [direct.error] : []),
    },
    browser: browser ? {
      http: browser.http,
      status: browser.body?.status || null,
      elapsedMs: browser.elapsedMs,
      identity: browserIdentity,
      signals: browserSignals,
      name: browser.body?.facts?.name || null,
      category: browser.body?.facts?.category || null,
      price: browser.body?.facts?.unitPriceUsd ?? null,
      moq: browser.body?.facts?.moq ?? null,
      weight: browser.body?.facts?.packedWeightKg ?? null,
      volume: browser.body?.facts?.volumeCbm ?? null,
      origin: browser.body?.facts?.originCountry ?? null,
      hs: browser.body?.facts?.hsCode ?? null,
      warnings: browser.body?.warnings || (browser.error ? [browser.error] : []),
    } : null,
    automaticIdentity,
    automaticComplete,
    resolution: source,
  })
}

const directIdentityCount = rows.filter((row) => row.direct.identity).length
const directCompleteCount = rows.filter((row) => row.direct.identity && row.direct.signals === 7).length
const browserAttempted = rows.filter((row) => row.browser).length
const browserRecoveredIdentity = rows.filter((row) => !row.direct.identity && row.browser?.identity).length
const browserCompleted = rows.filter((row) => !(row.direct.identity && row.direct.signals === 7) && row.browser?.identity && row.browser?.signals === 7).length
const automaticIdentityCount = rows.filter((row) => row.automaticIdentity).length
const automaticCompleteCount = rows.filter((row) => row.automaticComplete).length
const userConfirmationCount = rows.filter((row) => row.resolution === 'user_confirmation').length
const identityFailedCount = rows.filter((row) => row.resolution === 'identity_failed').length

const pct = (value, total = cases.length) => Number(((value / Math.max(1, total)) * 100).toFixed(1))
const summary = {
  cases: cases.length,
  directIdentity: { pass: directIdentityCount, total: cases.length, ratePct: pct(directIdentityCount) },
  directCompleteFicha: { pass: directCompleteCount, total: cases.length, ratePct: pct(directCompleteCount) },
  browserFallback: { attempted: browserAttempted, recoveredIdentity: browserRecoveredIdentity, completedFicha: browserCompleted },
  combinedAutomaticIdentity: { pass: automaticIdentityCount, total: cases.length, ratePct: pct(automaticIdentityCount) },
  combinedAutomaticCompleteFicha: { pass: automaticCompleteCount, total: cases.length, ratePct: pct(automaticCompleteCount) },
  userConfirmationRequired: { count: userConfirmationCount, ratePct: pct(userConfirmationCount) },
  identityFailed: { count: identityFailedCount, ratePct: pct(identityFailedCount) },
}

console.log('ALIBABA_STAGE3_RESULT=' + JSON.stringify({ summary, rows }))
console.log(JSON.stringify(summary, null, 2))
for (const row of rows) {
  console.log(`${row.id}: direct=${row.direct.identity ? 'IDENTITY' : 'NO-ID'} ${row.direct.signals}/7; browser=${row.browser ? `${row.browser.identity ? 'IDENTITY' : 'NO-ID'} ${row.browser.signals}/7` : 'SKIP'}; resolution=${row.resolution}`)
}

// Safety/readiness gate: no product in this curated live corpus may silently lose
// its identity. Missing logistics are allowed only if the case is explicitly sent
// to user confirmation.
if (identityFailedCount > 0) {
  console.error(`Stage 3 failed: ${identityFailedCount}/${cases.length} products could not be identified by either self-scraper.`)
  process.exit(1)
}
