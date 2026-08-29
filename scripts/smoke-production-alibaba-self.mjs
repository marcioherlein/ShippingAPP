const baseUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'

const cases = [
  {
    id: 'mechanical-watch-1601666174891',
    url: 'https://www.alibaba.com/product-detail/Fully-Automatic-Mechanical-Watches-42-5MM_1601666174891.html?spm=a2706.products_search.normal_offer.7.136d67afME8WWH&priceId=ae738f92db4f4b0aba0e6d90353cbf56',
    identity: /watch|wrist|mechanical/i,
  },
  {
    id: 'wifi-doorbell-1600667679915',
    url: 'https://www.alibaba.com/product-detail/High-Quality-Tuya-Smartlife-Wireless-Wifi_1600667679915.html',
    identity: /door|video|wifi|tuya|smart/i,
  },
]

function usableNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function usableText(value, rejected = []) {
  if (typeof value !== 'string' || !value.trim()) return false
  const normalized = value.trim().toLowerCase()
  return !rejected.some((item) => normalized === item.toLowerCase())
}

function summarizeFacts(facts = {}) {
  const signals = {
    identity: usableText(facts.name, ['Producto Alibaba']),
    category: usableText(facts.category, ['Sin clasificar']),
    price: usableNumber(facts.unitPriceUsd),
    moq: usableNumber(facts.moq),
    weight: usableNumber(facts.packedWeightKg),
    volume: usableNumber(facts.volumeCbm),
    origin: usableText(facts.originCountry),
  }
  return {
    signals,
    count: Object.values(signals).filter(Boolean).length,
    name: facts.name ?? null,
    category: facts.category ?? null,
    price: facts.unitPriceUsd ?? null,
    moq: facts.moq ?? null,
    weight: facts.packedWeightKg ?? null,
    volume: facts.volumeCbm ?? null,
    origin: facts.originCountry ?? null,
    hsCode: facts.hsCode ?? null,
    productId: facts.productId ?? null,
  }
}

async function probe(path, url) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  let body = null
  try { body = await response.json() } catch { body = null }
  return { ok: response.ok, status: response.status, body }
}

function mergeBest(direct, native) {
  const d = direct?.body?.facts || {}
  const n = native?.body?.facts || {}
  return {
    name: d.name || n.name || null,
    category: d.category || d.categoryPath?.at?.(-1) || n.category || n.categoryPath?.at?.(-1) || null,
    unitPriceUsd: d.unitPriceUsd || n.unitPriceUsd || null,
    moq: d.moq || n.moq || null,
    packedWeightKg: d.packedWeightKg || n.packedWeightKg || null,
    volumeCbm: d.volumeCbm || n.volumeCbm || null,
    originCountry: d.originCountry || n.originCountry || null,
    hsCode: d.hsCode || n.hsCode || null,
    productId: d.productId || n.productId || null,
  }
}

const results = []
for (const testCase of cases) {
  const direct = await probe('/api/alibaba-direct-probe', testCase.url)
  const directSummary = summarizeFacts(direct.body?.facts)

  let native = null
  if (!direct.ok || directSummary.count < 7) {
    native = await probe('/api/alibaba-native-probe', testCase.url)
  }

  const combined = mergeBest(direct, native)
  const summary = summarizeFacts(combined)
  const identityText = `${summary.name || ''} ${summary.category || ''}`
  const identityPass = testCase.identity.test(identityText)
  const pageAccessPass = direct.ok || Boolean(native?.ok)
  const completeFicha = summary.count === 7
  const fallback = direct.ok && directSummary.count === 7
    ? 'direct'
    : native?.ok
      ? 'direct+browser'
      : 'user-confirmation'

  results.push({
    id: testCase.id,
    pageAccessPass,
    identityPass,
    completeFicha,
    fallback,
    direct: { status: direct.status, signals: directSummary.count },
    native: native ? { status: native.status, signals: summarizeFacts(native.body?.facts).count } : null,
    combined: summary,
  })
}

const identitySuccess = results.filter((item) => item.identityPass).length
const accessSuccess = results.filter((item) => item.pageAccessPass).length
const completeSuccess = results.filter((item) => item.completeFicha).length
const catastrophic = results.filter((item) => item.pageAccessPass && !item.identityPass)

const report = {
  provider: 'ShippingAPP self-scrape only — Parse.bot is never called by these probe routes',
  total: results.length,
  pageAccessRatePct: Number(((accessSuccess / results.length) * 100).toFixed(1)),
  identitySuccessRatePct: Number(((identitySuccess / results.length) * 100).toFixed(1)),
  completeFichaRatePct: Number(((completeSuccess / results.length) * 100).toFixed(1)),
  catastrophicIdentityErrors: catastrophic.length,
  fallbackDistribution: results.reduce((acc, item) => {
    acc[item.fallback] = (acc[item.fallback] || 0) + 1
    return acc
  }, {}),
  results,
}

console.log(JSON.stringify(report, null, 2))

// Availability is allowed to degrade to the mandatory user-confirmation gate,
// but a readable page must never be accepted with the wrong product identity.
if (catastrophic.length) {
  throw new Error(`Alibaba self-scrape identity failure: ${catastrophic.map((item) => item.id).join(', ')}`)
}
if (identitySuccess === 0) {
  throw new Error('Alibaba self-scrape could not recover the identity of any live regression product.')
}
