const baseUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 15000)

const intakeCases = [
  { name: 'padel-completo', message: 'Paleta de pádel de fibra de carbono, núcleo EVA, uso deportivo, origen China, precio proveedor USD 18, MOQ 300 unidades, peso embalado 0.65 kg por unidad.', expect: { status: 'ready', category: 'Padel racket', unitPriceUsd: 18, moq: 300, packedWeightKg: 0.65, volumeCbm: 0.006, originCountry: 'China' } },
  { name: 'cargador-sin-precio', message: 'Cargador USB-C 65W para notebook y celular, origen China, MOQ 500 unidades, peso embalado 0.18 kg por unidad.', expect: { status: 'needs_input', missingIncludes: 'precio proveedor' } },
  { name: 'bateria-sin-moq', message: 'Batería recargable de ion litio 18650 para pack electrónico, origen China, precio proveedor USD 2.10, peso embalado 0.05 kg por unidad.', expect: { status: 'needs_input', missingIncludes: 'MOQ' } },
  { name: 'auricular-sin-peso', message: 'Auriculares Bluetooth inalámbricos con estuche de carga, origen China, precio proveedor USD 6.40, MOQ 200 unidades.', expect: { status: 'needs_input', missingIncludes: 'peso embalado por unidad' } },
  { name: 'parlante-sin-volumen', message: 'Parlante Bluetooth portátil 10W, plástico y componentes electrónicos, origen China, precio proveedor USD 9.50, MOQ 120 unidades, peso embalado 0.72 kg por unidad.', expect: { status: 'needs_input', missingIncludes: 'volumen embalado por unidad' } },
  { name: 'mochila-completa', message: 'Mochila escolar de poliéster para notebook, origen China, precio proveedor USD 4.20, MOQ 500 unidades, peso embalado 0.42 kg por unidad, volumen 0.012 m3 por unidad.', expect: { status: 'ready', unitPriceUsd: 4.2, moq: 500, packedWeightKg: 0.42, volumeCbm: 0.012, originCountry: 'China' } },
  { name: 'botella-termica-completa', message: 'Botella térmica de acero inoxidable 750 ml, origen China, precio proveedor USD 3.80, MOQ 300 unidades, peso embalado 0.38 kg por unidad, volumen 0.004 m3 por unidad.', expect: { status: 'ready', unitPriceUsd: 3.8, moq: 300, packedWeightKg: 0.38, volumeCbm: 0.004, originCountry: 'China' } },
  { name: 'teclado-completo', message: 'Teclado inalámbrico Bluetooth para computadora, origen China, precio proveedor USD 7.90, MOQ 250 unidades, peso embalado 0.48 kg por unidad, volumen 0.006 m3 por unidad.', expect: { status: 'ready', unitPriceUsd: 7.9, moq: 250, packedWeightKg: 0.48, volumeCbm: 0.006, originCountry: 'China' } },
  { name: 'mouse-completo', message: 'Mouse inalámbrico óptico para computadora, origen China, precio proveedor USD 2.70, MOQ 400 unidades, peso embalado 0.12 kg por unidad, volumen 0.002 m3 por unidad.', expect: { status: 'ready', unitPriceUsd: 2.7, moq: 400, packedWeightKg: 0.12, volumeCbm: 0.002, originCountry: 'China' } },
  { name: 'lampara-led-completa', message: 'Lámpara LED recargable de escritorio, origen China, precio proveedor USD 5.30, MOQ 180 unidades, peso embalado 0.55 kg por unidad, volumen 0.007 m3 por unidad.', expect: { status: 'ready', unitPriceUsd: 5.3, moq: 180, packedWeightKg: 0.55, volumeCbm: 0.007, originCountry: 'China' } },
  { name: 'cafetera-completa', message: 'Cafetera eléctrica espresso doméstica, origen China, precio proveedor USD 38, MOQ 50 unidades, peso embalado 4.2 kg por unidad, volumen 0.045 m3 por unidad.', expect: { status: 'ready', unitPriceUsd: 38, moq: 50, packedWeightKg: 4.2, volumeCbm: 0.045, originCountry: 'China' } },
  { name: 'termo-electrico-completo', message: 'Termotanque eléctrico mural de 80 litros para calentar agua, origen China, precio proveedor USD 72, MOQ 30 unidades, peso embalado 19 kg por unidad, volumen 0.18 m3 por unidad.', expect: { status: 'ready', unitPriceUsd: 72, moq: 30, packedWeightKg: 19, volumeCbm: 0.18, originCountry: 'China' } },
  { name: 'notebook-completa', message: 'Notebook portátil 14 pulgadas, procesador Intel, origen China, precio proveedor USD 265, MOQ 20 unidades, peso embalado 1.9 kg por unidad, volumen 0.009 m3 por unidad.', expect: { status: 'ready', unitPriceUsd: 265, moq: 20, packedWeightKg: 1.9, volumeCbm: 0.009, originCountry: 'China' } },
  { name: 'panel-solar-completo', message: 'Panel solar fotovoltaico monocristalino 450W, origen China, precio proveedor USD 58, MOQ 40 unidades, peso embalado 22 kg por unidad, volumen 0.08 m3 por unidad.', expect: { status: 'ready', unitPriceUsd: 58, moq: 40, packedWeightKg: 22, volumeCbm: 0.08, originCountry: 'China' } },
  { name: 'camara-ip-completa', message: 'Cámara IP de seguridad WiFi para exterior, origen China, precio proveedor USD 11.80, MOQ 100 unidades, peso embalado 0.48 kg por unidad, volumen 0.004 m3 por unidad.', expect: { status: 'ready', unitPriceUsd: 11.8, moq: 100, packedWeightKg: 0.48, volumeCbm: 0.004, originCountry: 'China' } },
  { name: 'zapatillas-completa', message: 'Zapatillas deportivas de capellada textil y suela de caucho, origen China, precio proveedor USD 12.50, MOQ 300 pares, peso embalado 0.9 kg por par, volumen 0.011 m3 por par.', expect: { status: 'ready', unitPriceUsd: 12.5, moq: 300, packedWeightKg: 0.9, volumeCbm: 0.011, originCountry: 'China' } },
  { name: 'gafas-sol-completa', message: 'Gafas de sol con montura plástica y lentes polarizadas, origen China, precio proveedor USD 1.85, MOQ 500 unidades, peso embalado 0.06 kg por unidad, volumen 0.001 m3 por unidad.', expect: { status: 'ready', unitPriceUsd: 1.85, moq: 500, packedWeightKg: 0.06, volumeCbm: 0.001, originCountry: 'China' } },
  { name: 'idea-sin-producto', message: 'Quiero ideas de productos fáciles para importar y vender en MercadoLibre con buen margen.', expect: { status: 'discovery_pending' } },
  { name: 'busqueda-paletas', message: 'Buscame paletas de carbono hasta USD 20 con bajo MOQ.', expect: { status: 'discovery_pending' } },
  { name: 'link-alibaba-no-fabrica', message: 'https://www.alibaba.com/product-detail/example-padel-racket.html', expect: { status: 'clarifyOrNeedsInput' } },
]

const classificationCases = [
  { name: 'paleta-padel', facts: { name: 'Paleta de pádel de fibra de carbono núcleo EVA', category: 'Padel racket', material: 'fibra de carbono / EVA', functionText: 'raqueta para jugar pádel', description: 'Padel racket for sports use' }, expectedCode: '9506.59.00' },
  { name: 'cargador-usbc', facts: { name: 'Cargador USB-C 65W', category: 'Power adapter', material: 'plástico y componentes electrónicos', functionText: 'convierte corriente eléctrica para cargar notebooks y celulares', description: 'USB-C 65W wall charger power adapter' }, expectedCode: '8504.40.90' },
  { name: 'bateria-litio', facts: { name: 'Batería recargable de ion litio 18650', category: 'Lithium-ion battery', material: 'iones de litio', functionText: 'acumula energía eléctrica recargable', description: 'rechargeable lithium ion cell battery' }, expectedCode: '8507.60.00' },
  { name: 'raqueta-tenis', facts: { name: 'Raqueta de tenis de grafito', category: 'Tennis racket', material: 'grafito', functionText: 'jugar tenis', description: 'tennis racket graphite' }, expectedCode: '9506.51.00' },
  { name: 'mesa-ping-pong', facts: { name: 'Mesa plegable de tenis de mesa ping pong', category: 'Table tennis table', material: 'madera y metal', functionText: 'jugar tenis de mesa', description: 'folding ping pong table' }, expectedPrefix: '9506.40' },
  { name: 'mancuernas', facts: { name: 'Mancuernas ajustables para gimnasio', category: 'Fitness equipment', material: 'metal y plástico', functionText: 'entrenamiento físico', description: 'adjustable dumbbells gym training' }, expectedPrefix: '9506.91' },
  { name: 'mochila', facts: { name: 'Mochila escolar de poliéster para notebook', category: 'Backpack', material: 'poliéster', functionText: 'transportar objetos personales y computadora', description: 'polyester backpack for laptop' } },
  { name: 'botella-termica', facts: { name: 'Botella térmica de acero inoxidable 750 ml', category: 'Vacuum flask', material: 'acero inoxidable', functionText: 'conservar bebidas calientes o frías', description: 'stainless steel vacuum insulated bottle' } },
  { name: 'auriculares-bluetooth', facts: { name: 'Auriculares Bluetooth inalámbricos', category: 'Wireless headphones', material: 'plástico y componentes electrónicos', functionText: 'reproducir audio de forma inalámbrica', description: 'bluetooth wireless earbuds headphones' } },
  { name: 'parlante-bluetooth', facts: { name: 'Parlante Bluetooth portátil 10W', category: 'Bluetooth speaker', material: 'plástico y electrónica', functionText: 'reproducir sonido', description: 'portable bluetooth speaker' } },
  { name: 'teclado', facts: { name: 'Teclado inalámbrico Bluetooth para computadora', category: 'Computer keyboard', material: 'plástico y electrónica', functionText: 'entrada de datos para computadora', description: 'wireless bluetooth keyboard for computer' } },
  { name: 'mouse', facts: { name: 'Mouse inalámbrico óptico para computadora', category: 'Computer mouse', material: 'plástico y electrónica', functionText: 'dispositivo de entrada para computadora', description: 'wireless optical computer mouse' } },
  { name: 'lampara-led', facts: { name: 'Lámpara LED recargable de escritorio', category: 'LED lamp', material: 'plástico y electrónica', functionText: 'iluminación eléctrica', description: 'rechargeable LED desk lamp' } },
  { name: 'cafetera', facts: { name: 'Cafetera eléctrica espresso doméstica', category: 'Electric coffee maker', material: 'plástico metal resistencia eléctrica', functionText: 'preparar café con energía eléctrica', description: 'electric espresso coffee maker' } },
  { name: 'termotanque', facts: { name: 'Termotanque eléctrico mural de 80 litros', category: 'Electric water heater', material: 'metal resistencia eléctrica tanque', functionText: 'calentar agua', description: 'electric storage water heater' } },
  { name: 'notebook', facts: { name: 'Notebook portátil 14 pulgadas', category: 'Laptop computer', material: 'componentes electrónicos', functionText: 'procesamiento automático de datos portátil', description: 'portable laptop computer 14 inch' } },
  { name: 'panel-solar', facts: { name: 'Panel solar fotovoltaico monocristalino 450W', category: 'Solar panel', material: 'celdas fotovoltaicas silicio', functionText: 'generar electricidad por luz solar', description: 'monocrystalline photovoltaic solar module' } },
  { name: 'camara-ip', facts: { name: 'Cámara IP de seguridad WiFi exterior', category: 'Security camera', material: 'electrónica y plástico', functionText: 'capturar video de seguridad', description: 'wifi IP security camera outdoor' } },
  { name: 'zapatillas', facts: { name: 'Zapatillas deportivas de capellada textil y suela de caucho', category: 'Sports shoes', material: 'textil caucho', functionText: 'calzado deportivo', description: 'sports footwear textile upper rubber sole' } },
  { name: 'gafas-sol', facts: { name: 'Gafas de sol con montura plástica y lentes polarizadas', category: 'Sunglasses', material: 'plástico lentes polarizadas', functionText: 'proteger los ojos del sol', description: 'polarized sunglasses plastic frame' } },
]

function almostEqual(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.00001
}

async function postJson(path, payload, label) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response
  let text
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    text = await response.text()
  } catch (error) {
    const reason = error?.name === 'AbortError' ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : (error?.message || 'request failed')
    throw new Error(`${label}: ${path} ${reason}`)
  } finally {
    clearTimeout(timeout)
  }

  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`${label}: ${path} returned non-JSON HTTP ${response.status}: ${String(text).slice(0, 500)}`)
  }
  if (!response.ok) throw new Error(`${label}: ${path} failed HTTP ${response.status}: ${JSON.stringify(body).slice(0, 1000)}`)
  return body
}

function assertIntake(caseDef, body) {
  const expected = caseDef.expect
  if (expected.status === 'clarifyOrNeedsInput') {
    if (!['clarify', 'needs_input', 'discovery_pending'].includes(body.status)) throw new Error(`${caseDef.name}: expected safe non-ready status, got ${body.status}`)
    if (body.analysis) throw new Error(`${caseDef.name}: must not fabricate analysis for a bare link`)
    return
  }
  if (body.status !== expected.status) throw new Error(`${caseDef.name}: expected status ${expected.status}, got ${body.status}: ${JSON.stringify(body).slice(0, 800)}`)
  if (expected.missingIncludes && !body.missingFields?.includes(expected.missingIncludes)) throw new Error(`${caseDef.name}: expected missing field ${expected.missingIncludes}, got ${body.missingFields}`)
  for (const field of ['category', 'originCountry']) {
    if (expected[field] !== undefined && body.facts?.[field] !== expected[field]) throw new Error(`${caseDef.name}: expected ${field}=${expected[field]}, got ${body.facts?.[field]}`)
  }
  for (const field of ['unitPriceUsd', 'moq', 'packedWeightKg', 'volumeCbm']) {
    if (expected[field] !== undefined && !almostEqual(body.facts?.[field], expected[field])) throw new Error(`${caseDef.name}: expected ${field}=${expected[field]}, got ${body.facts?.[field]}`)
  }
  if (expected.status === 'ready' && !body.analysis?.product?.name) throw new Error(`${caseDef.name}: ready intake must include analysis product`)
}

function assertOfficialClassification(caseDef, body) {
  if (body.status !== 'candidate' || !body.code) throw new Error(`${caseDef.name}: expected NCM candidate, got ${JSON.stringify(body).slice(0, 1000)}`)
  if (!/^\d{4}\.\d{2}\.\d{2}$/.test(body.code)) throw new Error(`${caseDef.name}: invalid NCM format ${body.code}`)
  const legacyArca = body.source === 'ARCA Arancel Integrado' && body.sourceDate === '2026-08-14'
  const ncmApp = body.source === 'NCM_APP.xlsx' && body.sourceDate === '2026-08-27'
  if (!legacyArca && !ncmApp) throw new Error(`${caseDef.name}: unexpected catalog source ${body.source} @ ${body.sourceDate}`)
  if ((body.catalogRecordCount ?? 0) < 10000) throw new Error(`${caseDef.name}: catalog too small ${body.catalogRecordCount}`)
  if (caseDef.expectedCode && body.code !== caseDef.expectedCode) throw new Error(`${caseDef.name}: expected ${caseDef.expectedCode}, got ${body.code} (${body.label})`)
  if (caseDef.expectedPrefix && !body.code.startsWith(caseDef.expectedPrefix)) throw new Error(`${caseDef.name}: expected prefix ${caseDef.expectedPrefix}, got ${body.code} (${body.label})`)
  const sim = body.sim
  if (sim?.candidate) {
    if (!/^\d{4}\.\d{2}\.\d{2}\.\d{3}[A-Z]$/.test(sim.candidate.code)) throw new Error(`${caseDef.name}: invalid SIM format ${sim.candidate.code}`)
    if (!sim.candidate.code.startsWith(`${body.code}.`)) throw new Error(`${caseDef.name}: SIM ${sim.candidate.code} does not belong to NCM ${body.code}`)
  }
}

async function main() {
  const intakeResults = []
  for (const item of intakeCases) {
    console.log(`[smoke:intake] ${item.name}`)
    const body = await postJson('/api/intake', { message: item.message, priorFacts: {} }, item.name)
    assertIntake(item, body)
    intakeResults.push({ name: item.name, status: body.status, missing: body.missingFields || [], product: body.analysis?.product?.name || body.facts?.name || null })
  }

  const classificationResults = []
  for (const item of classificationCases) {
    console.log(`[smoke:ncm] ${item.name}`)
    const body = await postJson('/api/ncm-classify', item.facts, item.name)
    assertOfficialClassification(item, body)
    classificationResults.push({ name: item.name, code: body.code, label: body.label, confidence: body.confidence, sim: body.sim?.candidate?.code || body.sim?.status || null })
  }

  console.log(JSON.stringify({
    status: 'ok',
    baseUrl,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    intakeCases: intakeResults.length,
    classificationCases: classificationResults.length,
    intakeResults,
    classificationResults,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
