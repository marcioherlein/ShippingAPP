export function evaluateArgentinaMarketSmoke(body, options = {}) {
  const minComparables = Math.max(1, Number(options.minComparables || 5))
  const requireDirectRetailer = options.requireDirectRetailer === true
  const market = body?.market || {}
  const source = typeof market.source === 'string' ? market.source.trim() : ''
  const comparables = Array.isArray(market.comparables) ? market.comparables : []
  const checks = [
    {
      name: 'benchmark_live',
      applicable: true,
      passed: body?.status === 'live' && market.status === 'live',
    },
    {
      name: 'minimum_comparables',
      applicable: true,
      passed: Number(market.comparableCount || 0) >= minComparables,
    },
    {
      name: 'positive_suggested_price',
      applicable: true,
      passed: Number(market.suggestedPriceArs || 0) > 0,
    },
    {
      name: 'source_traceability',
      applicable: true,
      passed: source.length > 0,
    },
    {
      name: 'traceable_comparables',
      applicable: true,
      passed: comparables.length >= minComparables,
    },
    {
      name: 'direct_retailer_source',
      applicable: requireDirectRetailer,
      passed: !requireDirectRetailer || source.includes('Retailers argentinos directos'),
    },
  ]
  const applicable = checks.filter((check) => check.applicable)
  const passed = applicable.filter((check) => check.passed).length
  return {
    healthy: applicable.length > 0 && passed === applicable.length,
    successRate: applicable.length ? passed / applicable.length : 0,
    minComparables,
    requireDirectRetailer,
    checks,
  }
}
