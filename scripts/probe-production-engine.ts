import { compareLandedCost } from '../src/lib/landedCostEngine'
import { optimizeQuantity } from '../src/lib/quantityOptimizer'

const productionUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'
const query = process.env.PROBE_QUERY || process.argv.slice(2).join(' ') || '72 Brand'
const budgetUsd = Number(process.env.PROBE_BUDGET_USD || 10000)
const requireReady = process.env.PROBE_REQUIRE_READY === '1'

async function postJson(path: string, body: unknown, timeoutMs = 70000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${productionUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await response.text()
    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error(`${path} returned non-JSON HTTP ${response.status}: ${text.slice(0, 1000)}`)
    }
    if (!response.ok) throw new Error(`${path} failed HTTP ${response.status}: ${JSON.stringify(parsed).slice(0, 2000)}`)
    return parsed
  } finally {
    clearTimeout(timeout)
  }
}

function finitePositive(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function finiteRate(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function print(stage: string, value: unknown) {
  console.log(`\n=== ${stage} ===`)
  console.log(JSON.stringify(value, null, 2))
}

async function main() {
  console.log(`ShippingAPP production engine probe`)
  console.log(`Query: ${query}`)
  console.log(`Budget: USD ${budgetUsd}`)
  console.log(`Production: ${productionUrl}`)

  const discovery = await postJson('/api/opportunity-search', { query, userText: query })
  const results = Array.isArray(discovery.results) ? discovery.results : []
  print('1. OPPORTUNITY SEARCH', {
    status: discovery.status,
    mode: discovery.mode,
    query: discovery.query,
    resultCount: results.length,
    constraints: discovery.constraints,
    warnings: discovery.warnings,
    topResults: results.slice(0, 5).map((item: any) => ({
      title: item.title,
      url: item.url,
      unitPriceUsd: item.unitPriceUsd,
      moq: item.moq,
      opportunityScore: item.opportunityScore,
      titleMatch: item.titleMatch,
      supplierName: item.supplierName,
      missingFacts: item.missingFacts,
    })),
  })

  const selected = results.find((item: any) => typeof item?.url === 'string' && item.url.startsWith('http'))
  if (!selected) throw new Error(`No real product URL returned for query "${query}".`)

  const analysis = await postJson('/api/analyze', { url: selected.url })
  const product = analysis.product || {}
  print('2. PRODUCT INGESTION', {
    selectedSearchTitle: selected.title,
    sourceUrl: analysis.sourceUrl,
    fetched: analysis.fetched,
    sourceRead: analysis.sourceRead,
    product,
    market: analysis.market,
    fx: analysis.fx,
    confidence: analysis.confidence,
    assumptions: analysis.assumptions,
  })

  const ncm = await postJson('/api/ncm-classify', {
    name: product.name,
    category: product.category,
    material: product.material,
    functionText: product.functionText,
    description: product.description,
  })
  print('3. NCM + TARIFF', {
    status: ncm.status,
    code: ncm.code,
    label: ncm.label,
    confidence: ncm.confidence,
    retrievalMode: ncm.retrievalMode,
    tariff: ncm.tariff,
    sim: ncm.sim,
    missingFacts: ncm.missingFacts,
    rationale: ncm.rationale,
    source: ncm.source,
    sourceDate: ncm.sourceDate,
  })

  const blockers: string[] = []
  if (!finitePositive(product.unitPriceUsd)) blockers.push('FOB unit price missing')
  if (!finitePositive(product.moq)) blockers.push('MOQ missing')
  if (!finitePositive(product.packedWeightKg)) blockers.push('Unit packed weight missing')
  if (!finitePositive(product.volumeCbm)) blockers.push('Unit volume missing')
  if (typeof product.originCountry !== 'string' || !product.originCountry.trim()) blockers.push('Origin country missing')
  if (ncm.status !== 'candidate' || !ncm.code) blockers.push('NCM candidate missing')
  if (!['high', 'medium'].includes(ncm.confidence)) blockers.push(`NCM confidence is ${ncm.confidence || 'missing'}`)

  const tariff = ncm.tariff || null
  for (const [label, value] of [
    ['DIE', tariff?.diePct],
    ['TE', tariff?.tePct],
    ['IVA', tariff?.vatPct],
    ['IVA adicional', tariff?.vatAdditionalPct],
    ['Ganancias', tariff?.gainsPct],
    ['IIBB', tariff?.iibbPct],
  ] as Array<[string, unknown]>) {
    if (!finiteRate(value)) blockers.push(`${label} rate missing`)
  }

  if (blockers.length) {
    const blocked = {
      status: 'blocked',
      query,
      selectedProduct: product.name || selected.title,
      blockers,
      message: 'Fail-closed: economics and optimization were not executed with invented facts.',
    }
    print('4. ECONOMICS GATE', blocked)
    if (requireReady) process.exitCode = 1
    return
  }

  const baseQuantity = Math.max(1, Math.round(product.moq))
  const landedInput = {
    originCountry: product.originCountry,
    quantity: baseQuantity,
    unitPriceUsd: product.unitPriceUsd,
    unitWeightKg: product.packedWeightKg,
    unitVolumeCbm: product.volumeCbm,
    dutyRatePct: tariff.diePct,
    statisticsRatePct: tariff.tePct,
    vatRatePct: tariff.vatPct,
    vatAdditionalRatePct: tariff.vatAdditionalPct,
    gainsRatePct: tariff.gainsPct,
    iibbRatePct: tariff.iibbPct,
    purpose: 'resale' as const,
    entityType: 'company' as const,
    hasImporterSignature: true,
    sensitiveCategory: 'none' as const,
    gainsExempt: false,
    capitalGoodEligible: Boolean(tariff.capitalGoodEligible),
    capitalGoodUse: false,
  }

  const comparison = compareLandedCost(landedInput)
  const selectedMode = comparison.bestMode
  const selectedCost = selectedMode ? comparison.modes[selectedMode] : null
  print('4. LANDED COST', {
    status: comparison.status,
    originRate: comparison.origin,
    baseQuantity,
    bestMode: selectedMode,
    selectedCost: selectedCost && {
      mode: selectedCost.mode,
      fobUsd: selectedCost.fobUsd,
      freightCostUsd: selectedCost.freightCostUsd,
      cifUsd: selectedCost.cifUsd,
      dutyUsd: selectedCost.dutyUsd,
      statisticsUsd: selectedCost.statisticsUsd,
      vatUsd: selectedCost.vatUsd,
      vatAdditionalUsd: selectedCost.vatAdditionalUsd,
      gainsUsd: selectedCost.gainsUsd,
      iibbUsd: selectedCost.iibbUsd,
      fixedDestinationUsd: selectedCost.fixedDestinationUsd,
      totalCostUsd: selectedCost.totalCostUsd,
      unitCostUsd: selectedCost.unitCostUsd,
    },
    lclVsAir: comparison.lclVsAir,
    checklist: comparison.checklist,
    notes: comparison.notes,
  })

  if (comparison.status !== 'ok' || !selectedCost || !selectedMode) {
    const economicsBlockers = [
      ...(comparison.checklist?.blockers || []),
      ...(comparison.status !== 'ok' ? [`Landed cost status: ${comparison.status}`] : []),
      ...(!selectedMode ? ['No unique actionable LCL/air mode'] : []),
    ]
    print('5. OPTIMIZATION GATE', { status: 'blocked', blockers: economicsBlockers })
    if (requireReady) process.exitCode = 1
    return
  }

  const arsPerUsd = finitePositive(analysis.fx?.arsPerUsd) ? analysis.fx.arsPerUsd : null
  const estimatedPriceArs = finitePositive(analysis.market?.estimatedPriceArs) ? analysis.market.estimatedPriceArs : null
  const localSellPriceUsd = arsPerUsd && estimatedPriceArs ? estimatedPriceArs / arsPerUsd : undefined
  const monthlyDemand = finitePositive(analysis.market?.estimatedMonthlyDemand) ? analysis.market.estimatedMonthlyDemand : undefined

  const optimization = optimizeQuantity({
    ...landedInput,
    budgetUsd,
    moq: baseQuantity,
    monthlyDemand,
    strategy: 'normal',
    localSellPriceUsd,
    priceTiers: [{ minQuantity: baseQuantity, unitPriceUsd: product.unitPriceUsd }],
  })

  print('5. QUANTITY OPTIMIZATION', {
    strategy: optimization.strategy,
    budgetUsd: optimization.budgetUsd,
    targetStockMonths: optimization.targetStockMonths,
    recommendation: optimization.recommendation && {
      quantity: optimization.recommendation.quantity,
      selectedMode: optimization.recommendation.selectedMode,
      totalCostUsd: optimization.recommendation.totalCostUsd,
      unitCostUsd: optimization.recommendation.unitCostUsd,
      marginPct: optimization.recommendation.marginPct,
      monthsOfStock: optimization.recommendation.monthsOfStock,
      affordable: optimization.recommendation.affordable,
      score: optimization.recommendation.score,
      reasons: optimization.recommendation.reasons,
    },
    topCandidates: optimization.candidates.slice(0, 6).map((candidate) => ({
      quantity: candidate.quantity,
      mode: candidate.selectedMode,
      totalCostUsd: candidate.totalCostUsd,
      unitCostUsd: candidate.unitCostUsd,
      affordable: candidate.affordable,
      score: candidate.score,
    })),
    notes: optimization.notes,
  })

  print('PROBE RESULT', {
    status: optimization.recommendation ? 'ready' : 'blocked',
    query,
    selectedProduct: product.name,
    ncm: ncm.code,
    ncmConfidence: ncm.confidence,
    baseQuantity,
    baseMode: selectedMode,
    baseUnitCostUsd: selectedCost.unitCostUsd,
    optimizedQuantity: optimization.recommendation?.quantity || null,
    optimizedUnitCostUsd: optimization.recommendation?.unitCostUsd || null,
  })

  if (requireReady && !optimization.recommendation) process.exitCode = 1
}

main().catch((error) => {
  console.error('\nPROBE FATAL ERROR')
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exitCode = 1
})
