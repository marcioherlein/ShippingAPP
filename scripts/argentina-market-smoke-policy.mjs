export function evaluateArgentinaMarketSmoke(body, options = {}) {
  const minComparables = Math.max(1, Number(options.minComparables || 5))
  const requireGoogle = options.requireGoogle === true
  const market = body?.market || {}
  const providers = body?.providers || {}
  const checks = [
    {
      name: 'google_shopping_configured',
      applicable: requireGoogle,
      passed: !requireGoogle || providers.googleShoppingConfigured === true,
    },
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
      passed: typeof market.source === 'string' && market.source.trim().length > 0,
    },
    {
      name: 'traceable_comparables',
      applicable: true,
      passed: Array.isArray(market.comparables) && market.comparables.length >= minComparables,
    },
  ]
  const applicable = checks.filter((check) => check.applicable)
  const passed = applicable.filter((check) => check.passed).length
  return {
    healthy: applicable.length > 0 && passed === applicable.length,
    successRate: applicable.length ? passed / applicable.length : 0,
    minComparables,
    checks,
  }
}
