const BASE_URL = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'
const TIMEOUT_MS = Number(process.env.AUDIT_REQUEST_TIMEOUT_MS || 35000)
const CONCURRENCY = Number(process.env.AUDIT_CONCURRENCY || 6)

// Snapshot taken from Mercado Libre Argentina's current public trends/search surfaces on 2026-08-28.
// Mercado Libre's official /trends/MLA resource returns 50 weekly trends; this audit intentionally
// tests the first 50 current visible Argentina search terms as end-user inputs, without adding
// synthetic product specifications that the search term did not contain.
const cases = [
  { rank: 1, term: 'aire acondicionado', kind: 'ambiguous_family', prefixes: ['8415'], note: 'tipo/capacidad no informados' },
  { rank: 2, term: 'aire acondicionado frio calor', kind: 'ambiguous_family', prefixes: ['8415'], note: 'tipo/capacidad no informados' },
  { rank: 3, term: 'aire acondicionado inverter', kind: 'ambiguous_family', prefixes: ['8415'], note: 'tipo/capacidad no informados' },
  { rank: 4, term: 'aire acondicionado split', kind: 'family', prefixes: ['8415'] },
  { rank: 5, term: 'apple iphone', kind: 'exact', exact: '85171300' },
  { rank: 6, term: 'auriculares jbl', kind: 'exact', exact: '85183000' },
  { rank: 7, term: 'calefon', kind: 'ambiguous_multi', prefixes: ['8419', '8516'], note: 'fuente de energía no informada' },
  { rank: 8, term: 'celulares samsung', kind: 'family', prefixes: ['851713', '851714', '8517'] },
  { rank: 9, term: 'cocina gas', kind: 'family', prefixes: ['732111', '7321'] },
  { rank: 10, term: 'cocinas', kind: 'ambiguous_multi', prefixes: ['7321', '8516'], note: 'gas/eléctrica no informado' },
  { rank: 11, term: 'freezer', kind: 'ambiguous_family', prefixes: ['8418'], note: 'horizontal/vertical no informado' },
  { rank: 12, term: 'freidora aire', kind: 'family', prefixes: ['8516'] },
  { rank: 13, term: 'freidora sin aceite', kind: 'family', prefixes: ['8516'] },
  { rank: 14, term: 'heladera', kind: 'ambiguous_family', prefixes: ['8418'], note: 'configuración no informada' },
  { rank: 15, term: 'heladera bajo mesada', kind: 'family', prefixes: ['8418'] },
  { rank: 16, term: 'heladera con freezer', kind: 'family', prefixes: ['8418'] },
  { rank: 17, term: 'heladera kohinoor', kind: 'ambiguous_family', prefixes: ['8418'], note: 'modelo/configuración no informados' },
  { rank: 18, term: 'heladera no frost', kind: 'family', prefixes: ['8418'] },
  { rank: 19, term: 'heladera no frost samsung', kind: 'family', prefixes: ['8418'] },
  { rank: 20, term: 'heladera samsung', kind: 'ambiguous_family', prefixes: ['8418'], note: 'modelo/configuración no informados' },
  { rank: 21, term: 'inmuebles', kind: 'non_product' },
  { rank: 22, term: 'iphone 14', kind: 'exact', exact: '85171300' },
  { rank: 23, term: 'iphone 14 pro max', kind: 'exact', exact: '85171300' },
  { rank: 24, term: 'iphone 15', kind: 'exact', exact: '85171300' },
  { rank: 25, term: 'iphone 15 pro max', kind: 'exact', exact: '85171300' },
  { rank: 26, term: 'iphone 16', kind: 'exact', exact: '85171300' },
  { rank: 27, term: 'iphone 16 plus', kind: 'exact', exact: '85171300' },
  { rank: 28, term: 'iphone 16 pro', kind: 'exact', exact: '85171300' },
  { rank: 29, term: 'iphone 16 pro max', kind: 'exact', exact: '85171300' },
  { rank: 30, term: 'lavarropas', kind: 'ambiguous_family', prefixes: ['8450'], note: 'capacidad/tipo no informados' },
  { rank: 31, term: 'lavarropas automatico', kind: 'ambiguous_family', prefixes: ['8450'], note: 'capacidad no informada' },
  { rank: 32, term: 'lavarropas drean', kind: 'ambiguous_family', prefixes: ['8450'], note: 'modelo/capacidad no informados' },
  { rank: 33, term: 'lavarropas samsung', kind: 'ambiguous_family', prefixes: ['8450'], note: 'modelo/capacidad no informados' },
  { rank: 34, term: 'lavasecarropas', kind: 'family', prefixes: ['8450'] },
  { rank: 35, term: 'microondas', kind: 'exact', exact: '85165000' },
  { rank: 36, term: 'notebook', kind: 'family', prefixes: ['847130'] },
  { rank: 37, term: 'parlantes', kind: 'ambiguous_family', prefixes: ['8518'], note: 'cantidad/configuración de altavoces no informada' },
  { rank: 38, term: 'procesadora', kind: 'family', prefixes: ['850940', '8509'] },
  { rank: 39, term: 'reloj inteligente', kind: 'ambiguous_multi', prefixes: ['8517', '9102'], note: 'función principal/conectividad no informadas' },
  { rank: 40, term: 'reloj smart watch', kind: 'ambiguous_multi', prefixes: ['8517', '9102'], note: 'función principal/conectividad no informadas' },
  { rank: 41, term: 'samsung', kind: 'non_product' },
  { rank: 42, term: 'samsung a54', kind: 'exact', exact: '85171300' },
  { rank: 43, term: 'secador de pelo', kind: 'exact', exact: '85163100' },
  { rank: 44, term: 'smart tv', kind: 'family', prefixes: ['852872', '8528'] },
  { rank: 45, term: 'smart tv 43 pulgadas', kind: 'family', prefixes: ['852872', '8528'] },
  { rank: 46, term: 'starlink internet', kind: 'ambiguous_family', prefixes: ['8517'], note: 'servicio vs kit físico no informado' },
  { rank: 47, term: 'tablets', kind: 'family', prefixes: ['847130', '8471'] },
  { rank: 48, term: 'televisor 50 pulgadas', kind: 'family', prefixes: ['852872', '8528'] },
  { rank: 49, term: 'televisores smart', kind: 'family', prefixes: ['852872', '8528'] },
  { rank: 50, term: 'termotanque electrico', kind: 'exact', exact: '85161000' },
]

function normalizeCode(value) {
  return String(value || '').replace(/\D/g, '')
}

async function request(path, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const started = Date.now()
  try {
    const response = await fetch(`${BASE_URL}${path}`, { ...options, signal: controller.signal })
    const text = await response.text()
    let body = null
    try { body = text ? JSON.parse(text) : null } catch { body = { raw: text.slice(0, 1000) } }
    return { ok: response.ok, http: response.status, body, ms: Date.now() - started }
  } catch (error) {
    return {
      ok: false,
      http: 0,
      body: { error: error?.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : error?.message || 'request failed' },
      ms: Date.now() - started,
    }
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

function matchesPrefix(code, prefixes = []) {
  return prefixes.some((prefix) => code.startsWith(normalizeCode(prefix)))
}

function evaluate(c, ncm) {
  const body = ncm.body || {}
  const code = normalizeCode(body.code)
  const confidence = body.confidence || null
  const missingFacts = Array.isArray(body.missingFacts) ? body.missingFacts : []

  if (!ncm.ok) {
    return { pass: false, status: ncm.http === 0 ? 'timeout_or_network' : 'http_error', reason: body.error || `HTTP ${ncm.http}` }
  }

  if (c.kind === 'non_product') {
    const unsafe = Boolean(code) && confidence === 'high' && missingFacts.length === 0
    return {
      pass: !unsafe,
      status: unsafe ? 'unsafe_non_product_classification' : 'safe_non_product_handling',
      reason: unsafe ? 'produjo una NCM de alta confianza para una búsqueda que no identifica un bien concreto' : 'no inventó una clasificación exacta de alta confianza',
    }
  }

  if (c.kind === 'exact') {
    const exactMatch = code === normalizeCode(c.exact)
    const usableConfidence = confidence === 'high' || confidence === 'medium'
    return {
      pass: exactMatch && usableConfidence,
      status: exactMatch ? (usableConfidence ? 'exact_match' : 'exact_but_low_confidence') : 'wrong_code',
      reason: exactMatch
        ? (usableConfidence ? 'NCM exacta y confianza utilizable' : 'código correcto pero el flujo quedaría bloqueado por baja confianza')
        : `esperado ${c.exact}, recibido ${body.code || 'sin código'}`,
    }
  }

  const familyMatch = Boolean(code) && matchesPrefix(code, c.prefixes)
  const ambiguityKind = c.kind === 'ambiguous_family' || c.kind === 'ambiguous_multi'
  if (!familyMatch) {
    return {
      pass: false,
      status: 'wrong_family',
      reason: `esperada familia ${c.prefixes.join(' / ')}, recibido ${body.code || 'sin código'}`,
    }
  }

  if (ambiguityKind) {
    const unsafePrecision = confidence === 'high' && missingFacts.length === 0
    return {
      pass: !unsafePrecision,
      status: unsafePrecision ? 'unsafe_precision' : 'correct_family_safe_ambiguity',
      reason: unsafePrecision
        ? `familia correcta pero cerró una NCM exacta con alta confianza sin pedir el dato discriminante: ${c.note}`
        : 'familia correcta y mantuvo cautela suficiente para un término genérico',
    }
  }

  const usableConfidence = confidence === 'high' || confidence === 'medium'
  return {
    pass: familyMatch && usableConfidence,
    status: usableConfidence ? 'correct_family' : 'correct_family_low_confidence',
    reason: usableConfidence ? 'familia NCM correcta con confianza utilizable' : 'familia correcta pero baja confianza bloquearía economics',
  }
}

async function runCase(c) {
  const intake = await postJson('/api/intake', { message: c.term })
  const facts = intake.body?.facts || {}
  const payload = {
    name: facts.name || c.term,
    category: facts.category || null,
    material: facts.material || null,
    functionText: facts.functionText || null,
    description: facts.description || c.term,
  }
  const ncm = await postJson('/api/ncm-classify', payload)
  const evaluation = evaluate(c, ncm)
  return {
    rank: c.rank,
    term: c.term,
    expectation: c.kind,
    expected: c.exact || c.prefixes || null,
    intake: {
      http: intake.http,
      ms: intake.ms,
      status: intake.body?.status || null,
      intent: intake.body?.intent || null,
      name: facts.name || null,
      category: facts.category || null,
      material: facts.material || null,
      functionText: facts.functionText || null,
      missingFields: intake.body?.missingFields || [],
    },
    ncm: {
      http: ncm.http,
      ms: ncm.ms,
      code: ncm.body?.code || null,
      simCode: ncm.body?.simCode || ncm.body?.simOpeningCandidate || null,
      confidence: ncm.body?.confidence || null,
      missingFacts: ncm.body?.missingFacts || [],
      tariff: ncm.body?.tariff ? {
        diePct: ncm.body.tariff.diePct ?? null,
        tePct: ncm.body.tariff.tePct ?? null,
        vatPct: ncm.body.tariff.vatPct ?? null,
      } : null,
      error: ncm.body?.error || null,
    },
    evaluation,
  }
}

async function mapLimit(items, limit, fn) {
  const output = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    while (true) {
      const index = nextIndex++
      if (index >= items.length) return
      output[index] = await fn(items[index])
      const r = output[index]
      console.log(`[${r.evaluation.pass ? 'PASS' : 'FAIL'}] #${r.rank} ${r.term} -> ${r.ncm.code || 'NO_NCM'} (${r.ncm.confidence || 'n/a'}) :: ${r.evaluation.status}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return output
}

function groupByStatus(results) {
  const grouped = {}
  for (const r of results) grouped[r.evaluation.status] = (grouped[r.evaluation.status] || 0) + 1
  return grouped
}

async function main() {
  console.log(`ShippingAPP Mercado Libre Top-50 NCM audit -> ${BASE_URL}`)
  console.log(`Cases: ${cases.length}; concurrency: ${CONCURRENCY}; timeout: ${TIMEOUT_MS}ms`)
  console.log('Trend snapshot date: 2026-08-28')
  console.log('')

  const results = await mapLimit(cases, CONCURRENCY, runCase)
  const failed = results.filter((r) => !r.evaluation.pass)
  const passed = results.filter((r) => r.evaluation.pass)
  const timeouts = results.filter((r) => r.evaluation.status === 'timeout_or_network')
  const lowConfidence = results.filter((r) => ['exact_but_low_confidence', 'correct_family_low_confidence'].includes(r.evaluation.status))
  const wrong = results.filter((r) => ['wrong_code', 'wrong_family'].includes(r.evaluation.status))
  const unsafe = results.filter((r) => ['unsafe_precision', 'unsafe_non_product_classification'].includes(r.evaluation.status))

  console.log('\n=== MERCADO LIBRE TOP-50 NCM AUDIT SUMMARY ===')
  console.log(JSON.stringify({
    baseUrl: BASE_URL,
    total: results.length,
    passed: passed.length,
    failed: failed.length,
    passRatePct: Math.round((passed.length / results.length) * 1000) / 10,
    statusCounts: groupByStatus(results),
    wrongClassificationCount: wrong.length,
    unsafePrecisionCount: unsafe.length,
    lowConfidenceBlockingCount: lowConfidence.length,
    timeoutCount: timeouts.length,
    failures: failed.map((r) => ({
      rank: r.rank,
      term: r.term,
      expected: r.expected,
      code: r.ncm.code,
      confidence: r.ncm.confidence,
      missingFacts: r.ncm.missingFacts,
      ncmMs: r.ncm.ms,
      status: r.evaluation.status,
      reason: r.evaluation.reason,
    })),
  }, null, 2))

  console.log('\n=== FULL MATRIX ===')
  console.log(JSON.stringify(results, null, 2))

  if (failed.length) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
