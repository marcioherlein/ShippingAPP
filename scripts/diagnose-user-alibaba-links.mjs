const baseUrl = (process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev').replace(/\/$/, '')
const internalToken = process.env.INTERNAL_API_TOKEN || ''

if (internalToken.length < 32) throw new Error('INTERNAL_API_TOKEN is required for production diagnostics')

const cases = [
  {
    id: 'stainless-45oz-1350ml',
    url: 'https://www.alibaba.com/product-detail/45oz-1350ml-Large-Capacity-Stainless-Steel_1600822775256.html?spm=a27aq.27095423.1978240560.1.783722779UHpQJ',
    expected: { codePrefix: '9617', rationale: 'vacuum-insulated stainless-steel beverage container' },
    manual: {
      category: 'Vacuum insulated stainless steel bottle / thermos',
      unitPriceUsd: 8,
      moq: 50,
      packedWeightKg: 0.65,
      volumeCbm: 0.0035,
      originCountry: 'China',
      material: 'Stainless steel',
      functionText: 'Reusable vacuum-insulated beverage container designed to keep drinks hot or cold.',
      description: '45 oz / 1350 ml large-capacity stainless-steel vacuum insulated bottle or thermos. Manual diagnostic clarification; commercial/logistics values are test placeholders when Alibaba does not expose them.',
    },
  },
  {
    id: 'large-sport-water-bottle',
    url: 'https://www.alibaba.com/product-detail/Large-Capacity-Sport-Water-Bottle-Gym_1601254829915.html',
    expected: { codePrefix: '3924', rationale: 'reusable plastic household/sport drinking bottle; exact subheading depends on construction/use' },
    manual: {
      category: 'Reusable sport water bottle',
      unitPriceUsd: 2.5,
      moq: 100,
      packedWeightKg: 0.35,
      volumeCbm: 0.0025,
      originCountry: 'China',
      material: 'Plastic',
      functionText: 'Reusable non-insulated drinking bottle for sports and gym hydration.',
      description: 'Large-capacity reusable sport/gym water bottle. Plastic is a manual diagnostic assumption for classification testing and must be supplier-verified before a real import decision.',
    },
  },
  {
    id: 'mens-uv400-sunglasses',
    url: 'https://www.alibaba.com/product-detail/Mens-Sunglasses-Luxury-Designer-Gafas-UV400_1600717697110.html?spm=a2700.product_home_fy25.just_for_you.69.2ce267afn7F3AG&priceId=0e8c84e8b53b4100b1906b6170bbcdf1',
    expected: { codePrefix: '9004.10', rationale: 'non-corrective sunglasses' },
    manual: {
      category: 'Sunglasses',
      unitPriceUsd: 2,
      moq: 20,
      packedWeightKg: 0.08,
      volumeCbm: 0.0003,
      originCountry: 'China',
      material: 'Plastic frame with tinted UV-protective lenses',
      functionText: 'Non-corrective sunglasses designed to protect the eyes from sunlight and UV radiation.',
      description: "Men's UV400 fashion sunglasses, non-corrective. Manual diagnostic clarification; commercial/logistics values are test placeholders when Alibaba does not expose them.",
    },
  },
]

const requiredFields = ['name', 'category', 'unitPriceUsd', 'moq', 'packedWeightKg', 'volumeCbm', 'originCountry']

function usable(field, value) {
  if (['unitPriceUsd', 'moq', 'packedWeightKg', 'volumeCbm'].includes(field)) return Number.isFinite(Number(value)) && Number(value) > 0
  if (field === 'category') return typeof value === 'string' && value.trim() && value.trim().toLowerCase() !== 'sin clasificar'
  return typeof value === 'string' && value.trim().length > 0
}

async function postJson(path, body, timeoutMs = 90000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shippingapp-internal-token': internalToken,
        'idempotency-key': `diag-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await response.text()
    let parsed
    try { parsed = JSON.parse(text) } catch { parsed = { nonJson: text.slice(0, 1000) } }
    return { status: response.status, ok: response.ok, headers: Object.fromEntries(response.headers), body: parsed }
  } finally {
    clearTimeout(timer)
  }
}

function summarizeProduct(product = {}) {
  return {
    name: product.name ?? null,
    category: product.category ?? null,
    unitPriceUsd: product.unitPriceUsd ?? null,
    moq: product.moq ?? null,
    packedWeightKg: product.packedWeightKg ?? null,
    volumeCbm: product.volumeCbm ?? null,
    originCountry: product.originCountry ?? null,
    material: product.material ?? null,
    functionText: product.functionText ?? null,
    description: product.description ?? null,
    imageUrl: product.imageUrl ?? null,
    supplier: product.supplier ?? null,
  }
}

function completeness(product = {}) {
  const fields = Object.fromEntries(requiredFields.map((field) => [field, usable(field, product[field])]))
  const completeCount = Object.values(fields).filter(Boolean).length
  return {
    fields,
    completeCount,
    requiredCount: requiredFields.length,
    complete: completeCount === requiredFields.length,
    missing: requiredFields.filter((field) => !fields[field]),
  }
}

function completeManually(product = {}, manual = {}) {
  const completed = { ...product }
  const filledMissing = []
  for (const field of requiredFields) {
    if (!usable(field, completed[field]) && usable(field, manual[field])) {
      completed[field] = manual[field]
      filledMissing.push(field)
    }
  }

  // Classification facts are user-editable clarifications. Apply these deliberately
  // so we can prove what happens after the user supplies the technical description.
  const clarified = []
  for (const field of ['category', 'material', 'functionText', 'description']) {
    if (manual[field] != null && completed[field] !== manual[field]) {
      completed[field] = manual[field]
      clarified.push(field)
    }
  }
  return { product: completed, filledMissing, clarified }
}

function ncmFacts(product = {}) {
  return {
    name: product.name || null,
    category: product.category || null,
    material: product.material || null,
    functionText: product.functionText || null,
    description: product.description || null,
  }
}

function summarizeClassification(result, expected) {
  const body = result.body || {}
  const code = body.code || null
  return {
    httpStatus: result.status,
    status: body.status || null,
    code,
    label: body.label || null,
    confidence: body.confidence || null,
    missingFacts: body.missingFacts || [],
    rationale: body.rationale || [],
    alternatives: Array.isArray(body.alternatives) ? body.alternatives.slice(0, 5) : [],
    sim: body.sim ? {
      status: body.sim.status,
      candidate: body.sim.candidate || null,
      confidence: body.sim.confidence || null,
      missingFacts: body.sim.missingFacts || [],
      rationale: body.sim.rationale || [],
    } : null,
    expectedPrefix: expected.codePrefix,
    expectedRationale: expected.rationale,
    expectedPrefixMatch: typeof code === 'string' && code.startsWith(expected.codePrefix),
  }
}

function analyzeSummary(result) {
  const b = result.body || {}
  return {
    httpStatus: result.status,
    productPresent: Boolean(b.product),
    product: b.product ? summarizeProduct(b.product) : null,
    market: b.market ? {
      estimatedPriceArs: b.market.estimatedPriceArs ?? null,
      source: b.market.source ?? null,
      status: b.market.details?.status ?? null,
      comparableCount: b.market.details?.comparableCount ?? null,
      confidence: b.market.details?.confidence ?? null,
    } : null,
    fx: b.fx ? { status: b.fx.status, arsPerUsd: b.fx.arsPerUsd ?? null, sourceDate: b.fx.sourceDate ?? null } : null,
    error: b.error || null,
    code: b.code || null,
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  productionUrl: baseUrl,
  note: 'Manual commercial/logistics values are diagnostic placeholders only when Alibaba did not expose a required value. They are not supplier-verified facts.',
  cases: [],
}

for (const testCase of cases) {
  console.log(`[diag] ${testCase.id}: product-read`)
  const read = await postJson('/api/product-read', { url: testCase.url })
  const readBody = read.body || {}
  const rawProduct = readBody.product || {}
  const rawCompleteness = completeness(rawProduct)

  console.log(`[diag] ${testCase.id}: raw ncm-classify`)
  const rawClass = await postJson('/api/ncm-classify', ncmFacts(rawProduct))

  const manual = completeManually(rawProduct, testCase.manual)
  const completedCompleteness = completeness(manual.product)

  console.log(`[diag] ${testCase.id}: analyze after manual completion`)
  const analysis = await postJson('/api/analyze', {
    sourceUrl: testCase.url,
    fetched: readBody.fetched === true,
    sourceRead: readBody.sourceRead,
    product: manual.product,
    suggestedQuantities: readBody.suggestedQuantities || [],
    confidence: readBody.confidence || {},
    assumptions: [
      ...(Array.isArray(readBody.assumptions) ? readBody.assumptions : []),
      `Diagnostic manual completion fields: ${manual.filledMissing.join(', ') || 'none'}.`,
      `Diagnostic classification clarifications: ${manual.clarified.join(', ') || 'none'}.`,
    ],
  })

  console.log(`[diag] ${testCase.id}: ncm-classify after manual completion`)
  const manualClass = await postJson('/api/ncm-classify', ncmFacts(manual.product))

  report.cases.push({
    id: testCase.id,
    url: testCase.url,
    scraper: {
      httpStatus: read.status,
      fetched: readBody.fetched === true,
      sourceRead: readBody.sourceRead || null,
      sourceEvidenceKeys: Object.keys(readBody.sourceEvidence || {}),
      parsebotUsed: Boolean(readBody.sourceEvidence?.parsebotAlibaba) || readBody.sourceRead?.mode === 'parsebot',
      browserUsed: Boolean(readBody.sourceEvidence?.nativeAlibaba) || readBody.sourceRead?.browserAttempted === true,
      product: summarizeProduct(rawProduct),
      completeness: rawCompleteness,
      confidence: readBody.confidence || null,
      assumptions: Array.isArray(readBody.assumptions) ? readBody.assumptions : [],
    },
    rawClassification: summarizeClassification(rawClass, testCase.expected),
    manualCompletion: {
      filledMissing: manual.filledMissing,
      classificationClarifications: manual.clarified,
      completedProduct: summarizeProduct(manual.product),
      completeness: completedCompleteness,
      diagnosticPlaceholderValues: Object.fromEntries(manual.filledMissing.map((field) => [field, testCase.manual[field]])),
    },
    continuedAnalysis: analyzeSummary(analysis),
    classificationAfterManualCompletion: summarizeClassification(manualClass, testCase.expected),
  })

  await new Promise((resolve) => setTimeout(resolve, 1500))
}

console.log('DIAGNOSTIC_REPORT_START')
console.log(JSON.stringify(report, null, 2))
console.log('DIAGNOSTIC_REPORT_END')
