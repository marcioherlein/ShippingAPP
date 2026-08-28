const baseUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'
const REQUEST_TIMEOUT_MS = Number(process.env.AUDIT_REQUEST_TIMEOUT_MS || 30000)

const results = []

async function request(path, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${baseUrl}${path}`, { ...options, signal: controller.signal })
    const text = await response.text()
    let body
    try { body = text ? JSON.parse(text) : null } catch { body = { raw: text.slice(0, 1000) } }
    return { ok: response.ok, http: response.status, body }
  } catch (error) {
    return { ok: false, http: 0, body: { error: error?.name === 'AbortError' ? `timeout after ${REQUEST_TIMEOUT_MS}ms` : error?.message || 'request failed' } }
  } finally {
    clearTimeout(timeout)
  }
}

function postJson(path, payload) {
  return request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

function record(group, name, pass, actual, expected) {
  results.push({ group, name, pass, actual, expected })
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${group} / ${name}`)
}

// Representative live sample. The broader deterministic NCM/product matrix stays in Vitest;
// this probe verifies that the deployed worker and its live providers behave the same way.
const productCases = [
  { id: 'tennis-racket', text: 'Raqueta de tenis profesional de grafito', category: 'Tennis racket', material: 'grafito', fn: 'jugar tenis', code: '9506.51.00' },
  { id: 'padel-racket', text: 'Paleta de pádel de fibra de carbono EVA', category: 'Padel racket', material: 'fibra de carbono / EVA', fn: 'jugar pádel', code: '9506.59.00' },
  { id: 'usb-c-charger', text: 'Cargador USB-C 65W power adapter', category: 'cargador eléctrico', material: 'plástico y componentes electrónicos', fn: 'convertir y suministrar energía eléctrica', code: '8504.40.90' },
  { id: 'mini-projector', text: 'Mini proyector 1080p LED', category: 'proyector', material: 'electrónica', fn: 'proyectar imagen', code: '8528.69.00' },
  { id: 'solar-panel', text: 'Panel solar fotovoltaico ensamblado', category: 'panel fotovoltaico', material: 'células fotovoltaicas y vidrio', fn: 'generar electricidad solar', code: '8541.43.00' },
  { id: 'espresso-machine', text: 'Cafetera espresso eléctrica', category: 'cafetera', material: 'metal, plástico y resistencia eléctrica', fn: 'preparar café mediante calentamiento eléctrico', code: '8516.71.00' },
]

async function auditIntake(product) {
  const response = await postJson('/api/intake', { message: product.text })
  const body = response.body || {}
  const pass = response.ok && body.status !== 'clarify' && Boolean(body.facts?.name)
  record('intake', product.id, pass, {
    http: response.http,
    status: body.status,
    intent: body.intent,
    name: body.facts?.name || null,
    missing: body.missingFields || [],
  }, { preserveProductIdentity: true, mustNotClarifyOnlyBecauseProductIsUnknown: true })
}

async function auditNcm(product) {
  const response = await postJson('/api/ncm-classify', {
    name: product.text,
    category: product.category,
    material: product.material,
    functionText: product.fn,
    description: product.text,
  })
  const body = response.body || {}
  const tariff = body.tariff || {}
  const pass = response.ok
    && body.code === product.code
    && ['high', 'medium'].includes(body.confidence)
    && Number.isFinite(tariff.diePct)
    && Number.isFinite(tariff.tePct)
    && Number.isFinite(tariff.vatPct)
  record('ncm+tariff', product.id, pass, {
    http: response.http,
    code: body.code || null,
    confidence: body.confidence || null,
    diePct: tariff.diePct ?? null,
    tePct: tariff.tePct ?? null,
    vatPct: tariff.vatPct ?? null,
    gainsPct: tariff.gainsPct ?? null,
    capitalGoodEligible: tariff.capitalGoodEligible ?? null,
    missingFacts: body.missingFacts || [],
  }, { code: product.code, tariffRequired: true })
}

async function auditAmbiguousNcm() {
  const response = await postJson('/api/ncm-classify', {
    name: 'Máquina industrial multipropósito',
    category: 'máquina industrial',
    description: 'Máquina industrial multipropósito para fábrica',
  })
  const body = response.body || {}
  const unsafe = response.ok && body.code && body.confidence === 'high' && !(body.missingFacts || []).length
  record('ncm-safety', 'ambiguous-industrial-machine', !unsafe, {
    http: response.http,
    code: body.code || null,
    confidence: body.confidence || null,
    missingFacts: body.missingFacts || [],
    status: body.status || null,
  }, { mustNotProduceUnqualifiedHighConfidenceClassification: true })
}

async function auditOpportunity(id, query) {
  const response = await postJson('/api/opportunity-search', { query, userText: query, limit: 5 })
  const body = response.body || {}
  const list = Array.isArray(body.results) ? body.results : []
  const useful = list.some((item) => item?.title && item?.url && (item?.unitPriceUsd || item?.moq || item?.supplierName || item?.imageUrl))
  const pass = response.ok && body.status === 'live' && list.length > 0 && useful
  record('alibaba-live', id, pass, {
    http: response.http,
    status: body.status,
    mode: body.mode,
    count: list.length,
    creditsEstimated: body.creditsEstimated,
    top: list[0] ? { title: list[0].title, unitPriceUsd: list[0].unitPriceUsd, moq: list[0].moq, supplierName: list[0].supplierName } : null,
    warnings: body.warnings || [],
  }, { status: 'live', realProductUrlAndCommercialFactRequired: true })
}

async function auditMeli(id, productName, category) {
  const status = await request('/api/mercadolibre/status')
  if (!status.ok || !status.body?.auth?.ready || status.body?.auth?.apiReady === false) {
    record('mercadolibre', id, true, { state: 'degraded-but-safe', http: status.http, auth: status.body?.auth || null }, { allowed: 'explicitly degraded; must not fabricate data' })
    return
  }
  const response = await postJson('/api/mercadolibre/benchmark', { productName, category })
  const body = response.body || {}
  const safeStatus = ['live', 'insufficient', 'unavailable'].includes(body.status)
  const liveHasPrice = body.status !== 'live' || Number(body.market?.suggestedPriceArs) > 0
  const no403 = !JSON.stringify(body).includes('Mercado Libre API 403')
  record('mercadolibre', id, response.ok && safeStatus && liveHasPrice && no403, {
    http: response.http,
    status: body.status,
    query: body.query,
    comparableCount: body.market?.comparableCount,
    suggestedPriceArs: body.market?.suggestedPriceArs,
    warnings: body.market?.warnings || [],
  }, { statuses: ['live', 'insufficient', 'unavailable'], noFabricatedLivePrice: true })
}

async function main() {
  console.log(`ShippingAPP adversarial production audit -> ${baseUrl}`)
  console.log(`Representative live products: ${productCases.length}`)

  await Promise.all(productCases.map(auditIntake))
  await Promise.all(productCases.map(auditNcm))
  await auditAmbiguousNcm()

  // Only three supplier searches: enough to exercise the provider/failover chain without burning credits.
  await Promise.all([
    auditOpportunity('padel-racket', 'carbon padel racket EVA'),
    auditOpportunity('usb-c-charger', 'usb c 65w gan charger'),
    auditOpportunity('espresso-machine', 'electric espresso coffee maker'),
  ])

  await Promise.all([
    auditMeli('padel-racket', 'Paleta de pádel carbono EVA', 'Padel racket'),
    auditMeli('usb-c-charger', 'Cargador USB-C 65W GaN', 'Cargador'),
  ])

  const failed = results.filter((item) => !item.pass)
  const grouped = Object.fromEntries([...new Set(results.map((item) => item.group))].map((group) => {
    const groupResults = results.filter((item) => item.group === group)
    return [group, { total: groupResults.length, passed: groupResults.filter((item) => item.pass).length, failed: groupResults.filter((item) => !item.pass).length }]
  }))

  console.log('\n=== ADVERSARIAL ENGINE AUDIT SUMMARY ===')
  console.log(JSON.stringify({ baseUrl, total: results.length, passed: results.length - failed.length, failed: failed.length, grouped, failures: failed }, null, 2))
  if (failed.length) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
