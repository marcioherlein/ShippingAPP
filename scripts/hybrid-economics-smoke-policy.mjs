export function evaluateHybridEconomicsSmoke(body, options = {}) {
  const minComparables = Math.max(1, Number(options.minComparables || 5))
  const analysis = body?.analysis || {}
  const market = analysis?.market || {}
  const details = market?.details || {}
  const source = typeof market?.source === 'string' ? market.source : ''
  const assumptions = Array.isArray(analysis?.assumptions) ? analysis.assumptions.map(String) : []
  const staleAssumptions = assumptions.filter((value) => {
    const normalized = value.toLowerCase()
    return normalized.includes('mercado local bloqueado')
      || normalized.includes('mercado local no confirmado')
      || normalized.includes('comparables activos de mercado libre')
  })
  const price = Number(market?.estimatedPriceArs || 0)
  const suggested = Number(details?.suggestedPriceArs || 0)
  const priceAligned = price > 0 && suggested > 0 && Math.abs(price - suggested) <= 1

  const checks = [
    { name: 'intake_ready', passed: body?.status === 'ready' },
    { name: 'analysis_product', passed: Boolean(analysis?.product) },
    { name: 'benchmark_live', passed: details?.status === 'live' },
    { name: 'direct_retailer_source', passed: source.includes('Retailers argentinos directos') },
    { name: 'minimum_comparables', passed: Number(details?.comparableCount || 0) >= minComparables },
    { name: 'positive_user_price', passed: price > 0 },
    { name: 'live_market_confidence', passed: String(analysis?.confidence?.market || '').startsWith('live-') },
    { name: 'traceable_comparables', passed: Array.isArray(details?.comparables) && details.comparables.length >= minComparables },
    { name: 'no_stale_ml_assumptions', passed: staleAssumptions.length === 0 },
    { name: 'authoritative_price_alignment', passed: priceAligned },
  ]
  const passed = checks.filter((check) => check.passed).length
  return {
    healthy: passed === checks.length,
    successRate: checks.length ? passed / checks.length : 0,
    minComparables,
    checks,
    staleAssumptions,
  }
}
