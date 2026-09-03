const baseUrl = (process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev').replace(/\/$/, '')
const token = process.env.INTERNAL_API_TOKEN || ''
if (token.length < 32) throw new Error('INTERNAL_API_TOKEN required')

async function post(path, body, timeoutMs = 90000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shippingapp-internal-token': token,
        'idempotency-key': `diag2-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await response.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return { status: response.status, contentType: response.headers.get('content-type'), json, text: json ? null : text.slice(0, 1500) }
  } finally {
    clearTimeout(timer)
  }
}

const classificationCases = [
  {
    id: 'thermos-spanish',
    expectedPrefix: '9617.00.10',
    facts: {
      name: 'Termo botella térmica 1350 ml de acero inoxidable',
      category: 'Termo y recipiente isotérmico aislado por vacío',
      material: 'Acero inoxidable',
      functionText: 'Recipiente reutilizable aislado por vacío para conservar bebidas frías o calientes.',
      description: 'Termo de 1,35 litros con ampolla o doble pared de acero inoxidable, montado y aislado por vacío, para bebidas.',
    },
  },
  {
    id: 'sport-bottle-spanish',
    expectedPrefix: '3924',
    facts: {
      name: 'Botella deportiva reutilizable de plástico para agua',
      category: 'Botella de plástico para beber de uso doméstico y deportivo',
      material: 'Plástico',
      functionText: 'Recipiente no isotérmico reutilizable para contener y beber agua durante deporte o gimnasio.',
      description: 'Botella de plástico de gran capacidad para servicio de bebidas y uso personal; no es envase para transporte comercial ni está aislada al vacío.',
    },
  },
  {
    id: 'sunglasses-spanish',
    expectedPrefix: '9004.10',
    facts: {
      name: 'Gafas de sol UV400 para hombre',
      category: 'Gafas de sol',
      material: 'Montura plástica y lentes de policarbonato',
      functionText: 'Protección ocular no correctiva frente a radiación solar y UV.',
      description: 'Anteojos o gafas de sol no correctivas con protección UV400.',
    },
  },
]

const output = { classifications: [], sunglassesAnalyzeRetry: [] }
for (const c of classificationCases) {
  const result = await post('/api/ncm-classify', c.facts)
  const b = result.json || {}
  output.classifications.push({
    id: c.id,
    httpStatus: result.status,
    expectedPrefix: c.expectedPrefix,
    status: b.status || null,
    code: b.code || null,
    label: b.label || null,
    confidence: b.confidence || null,
    expectedPrefixMatch: typeof b.code === 'string' && b.code.startsWith(c.expectedPrefix),
    missingFacts: b.missingFacts || [],
    rationale: b.rationale || [],
    alternatives: Array.isArray(b.alternatives) ? b.alternatives.slice(0, 5) : [],
    sim: b.sim || null,
    nonJson: result.text,
  })
}

const sunglassesProduct = {
  name: 'Mens Sunglasses Luxury Designer Gafas UV400',
  category: 'Sunglasses',
  unitPriceUsd: 2,
  moq: 2,
  packedWeightKg: 0.15,
  volumeCbm: 0.000225,
  originCountry: 'China',
  material: 'Plastic frame with polycarbonate tinted UV400 lenses',
  functionText: 'Non-corrective sunglasses designed to protect the eyes from sunlight and UV radiation.',
  description: "Men's UV400 non-corrective fashion sunglasses.",
}

for (let attempt = 1; attempt <= 2; attempt += 1) {
  const result = await post('/api/analyze', {
    sourceUrl: 'https://www.alibaba.com/product-detail/Mens-Sunglasses-Luxury-Designer-Gafas-UV400_1600717697110.html',
    fetched: true,
    product: sunglassesProduct,
    confidence: { overall: 80 },
    assumptions: ['Manual diagnostic retry after the production 503 observed in the first run.'],
  })
  output.sunglassesAnalyzeRetry.push({
    attempt,
    httpStatus: result.status,
    contentType: result.contentType,
    productPresent: Boolean(result.json?.product),
    marketStatus: result.json?.market?.details?.status || null,
    marketSource: result.json?.market?.source || null,
    fxStatus: result.json?.fx?.status || null,
    error: result.json?.error || null,
    code: result.json?.code || null,
    nonJson: result.text,
  })
  if (result.status === 200) break
  await new Promise((resolve) => setTimeout(resolve, 6000))
}

console.log('SECONDARY_DIAGNOSTIC_START')
console.log(JSON.stringify(output, null, 2))
console.log('SECONDARY_DIAGNOSTIC_END')
