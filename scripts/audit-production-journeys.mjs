const baseUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'
const REQUEST_TIMEOUT_MS = Number(process.env.AUDIT_REQUEST_TIMEOUT_MS || 28000)

const results = []

async function postJson(path, payload) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const text = await response.text()
    let body = null
    try { body = text ? JSON.parse(text) : null } catch { body = { raw: text.slice(0, 800) } }
    return { ok: response.ok, statusCode: response.status, body }
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      body: { error: error?.name === 'AbortError' ? `timeout after ${REQUEST_TIMEOUT_MS}ms` : (error?.message || 'request failed') },
    }
  } finally {
    clearTimeout(timeout)
  }
}

function record(group, name, pass, actual, expected, detail = '') {
  results.push({ group, name, pass, expected, actual, detail })
  const mark = pass ? 'PASS' : 'FAIL'
  console.log(`[${mark}] ${group} / ${name}${detail ? ` — ${detail}` : ''}`)
}

async function intakeCase(name, message, expectation) {
  const response = await postJson('/api/intake', { message, priorFacts: expectation.priorFacts || undefined })
  const body = response.body || {}
  let pass = response.ok
  if (expectation.status) pass = pass && body.status === expectation.status
  if (expectation.notStatus) pass = pass && body.status !== expectation.notStatus
  if (expectation.allowed) pass = pass && expectation.allowed.includes(body.status)
  if (expectation.namePresent) pass = pass && Boolean(body.facts?.name)
  if (expectation.preserveName) pass = pass && body.facts?.name === expectation.preserveName
  record('intake', name, pass, {
    http: response.statusCode,
    status: body.status,
    intent: body.intent,
    name: body.facts?.name || null,
    category: body.facts?.category || null,
    missing: body.missingFields || [],
    message: body.message || body.error || null,
  }, expectation)
  return body
}

async function opportunityCase(name, query) {
  const response = await postJson('/api/opportunity-search', { query, userText: query, limit: 6 })
  const body = response.body || {}
  const pass = response.ok && body.status === 'live' && Array.isArray(body.results) && body.results.length > 0
  record('opportunity-search', name, pass, {
    http: response.statusCode,
    status: body.status,
    mode: body.mode,
    count: body.results?.length || 0,
    note: body.note || body.error || null,
    warnings: body.warnings || [],
  }, { status: 'live', minResults: 1 })
}

async function directDiscoveryCase(name, query) {
  const response = await postJson('/api/discover', { query, userText: query })
  const body = response.body || {}
  const pass = response.ok && ['live', 'unavailable'].includes(body.status)
  record('direct-browser-fallback', name, pass, {
    http: response.statusCode,
    status: body.status,
    mode: body.mode,
    count: body.results?.length || 0,
    note: body.note || body.error || null,
    browserAttempted: body.browserAttempted,
    viableAsLiveFallback: body.status === 'live' && Array.isArray(body.results) && body.results.length > 0,
  }, { informational: 'endpoint must respond safely; live indicates fallback provider is viable' })
}

async function ncmCase(name, facts, expectedCode) {
  const response = await postJson('/api/ncm-classify', facts)
  const body = response.body || {}
  const tariff = body.tariff || null
  const pass = response.ok && body.code === expectedCode && tariff && Number.isFinite(tariff.diePct) && Number.isFinite(tariff.tePct)
  record('ncm', name, pass, {
    http: response.statusCode,
    code: body.code || null,
    confidence: body.confidence || null,
    dutyRatePct: tariff?.diePct ?? null,
    statisticsRatePct: tariff?.tePct ?? null,
    vatRatePct: tariff?.vatPct ?? null,
    capitalGoodEligible: tariff?.capitalGoodEligible ?? null,
  }, { code: expectedCode, tariffRequired: true })
}

async function main() {
  console.log(`ShippingAPP production journey audit -> ${baseUrl}`)

  // Realistic terse inputs: these are the phrases users actually type in the UI.
  const tennis = await intakeCase('terse-tennis-racket', 'Raqueta de tenis profesional', {
    notStatus: 'clarify', namePresent: true,
  })
  await intakeCase('terse-padel-racket', 'Paleta de pádel de carbono', {
    notStatus: 'clarify', namePresent: true,
  })
  await intakeCase('terse-usbc-charger', 'Cargador USB-C 65W', {
    notStatus: 'clarify', namePresent: true,
  })
  await intakeCase('terse-thermal-bottle', 'Botella térmica de acero inoxidable', {
    notStatus: 'clarify', namePresent: true,
  })
  await intakeCase('generic-valid-product-phrase', 'Organizador de cables de silicona para escritorio', {
    notStatus: 'clarify', namePresent: true,
  })

  // Rich intake should reach ready without search.
  await intakeCase('rich-tennis-racket', 'Raqueta de tenis profesional de grafito, origen China, precio proveedor USD 24, MOQ 100 unidades, peso embalado 0.45 kg por unidad, volumen 0.004 m3 por unidad.', {
    status: 'ready', namePresent: true,
  })

  // Search/discovery wording should route predictably.
  await intakeCase('explicit-search', 'Buscame raquetas de tenis profesionales en Alibaba', {
    status: 'discovery_pending',
  })
  await intakeCase('idea-discovery', 'Quiero ideas de productos para importar y vender con buen margen', {
    status: 'discovery_pending',
  })

  // Follow-up must preserve a recognized product rather than losing thread state.
  if (tennis?.facts?.name) {
    await intakeCase('follow-up-preserves-product', 'Precio proveedor USD 24, MOQ 100 unidades, origen China, peso embalado 0.45 kg, volumen 0.004 m3.', {
      priorFacts: tennis.facts,
      notStatus: 'clarify',
      preserveName: tennis.facts.name,
    })
  } else {
    record('intake', 'follow-up-preserves-product', false, { skipped: true }, { preservePriorProduct: true }, 'terse tennis input never established product identity')
  }

  // Provider matrix. The first is the current control query; the rest are user-facing categories.
  await opportunityCase('control-smart-door-phone', 'smart wifi video door phone')
  await opportunityCase('carbon-padel-racket', 'carbon padel racket')
  await opportunityCase('professional-tennis-racket', 'professional tennis racket')
  await opportunityCase('usb-c-65w-charger', 'usb c 65w charger')

  // Existing independent Alibaba direct/browser engine: diagnostic for provider fallback viability.
  await directDiscoveryCase('carbon-padel-direct-browser', 'carbon padel racket')
  await directDiscoveryCase('tennis-direct-browser', 'professional tennis racket')

  // Customs/tariff layer sanity checks for two sports products shown in the UI examples.
  await ncmCase('tennis-racket', {
    name: 'Raqueta de tenis de grafito', category: 'Tennis racket', material: 'grafito',
    functionText: 'jugar tenis', description: 'professional graphite tennis racket',
  }, '9506.51.00')
  await ncmCase('padel-racket', {
    name: 'Paleta de pádel de fibra de carbono', category: 'Padel racket', material: 'fibra de carbono / EVA',
    functionText: 'jugar pádel', description: 'carbon fiber padel racket EVA core',
  }, '9506.59.00')

  const failed = results.filter((item) => !item.pass)
  const grouped = Object.fromEntries([...new Set(results.map((item) => item.group))].map((group) => {
    const groupResults = results.filter((item) => item.group === group)
    return [group, { total: groupResults.length, passed: groupResults.filter((item) => item.pass).length, failed: groupResults.filter((item) => !item.pass).length }]
  }))

  console.log('\n=== AUDIT SUMMARY ===')
  console.log(JSON.stringify({ baseUrl, total: results.length, passed: results.length - failed.length, failed: failed.length, grouped, failures: failed }, null, 2))

  if (failed.length) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
