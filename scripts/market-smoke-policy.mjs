export function evaluateMarketSmoke(status, benchmark = null) {
  const authConfigured = Boolean(status?.auth?.ready)
  const apiAccessOk = authConfigured ? status?.auth?.apiReady !== false : null
  const benchmarkStatus = benchmark?.status || benchmark?.market?.status || null
  const price = benchmark?.market?.suggestedPriceArs ?? null
  const comparableCount = Number(benchmark?.market?.comparableCount || 0)

  const checks = [
    { name: 'provider_configured', applicable: true, passed: authConfigured },
    { name: 'authenticated_api_access', applicable: authConfigured, passed: apiAccessOk === true },
    { name: 'benchmark_live', applicable: authConfigured && apiAccessOk === true, passed: benchmarkStatus === 'live' },
    { name: 'comparable_floor', applicable: benchmarkStatus === 'live', passed: comparableCount >= 5 },
    { name: 'positive_price', applicable: benchmarkStatus === 'live', passed: typeof price === 'number' && price > 0 },
  ]

  const applicable = checks.filter((check) => check.applicable)
  const passed = applicable.filter((check) => check.passed)
  const successRate = applicable.length ? passed.length / applicable.length : 0

  let state = 'unconfigured'
  if (authConfigured && apiAccessOk === false) state = 'configured_broken'
  else if (authConfigured && apiAccessOk === true && benchmarkStatus === 'live' && comparableCount >= 5 && typeof price === 'number' && price > 0) state = 'healthy'
  else if (authConfigured && apiAccessOk === true && benchmarkStatus === 'insufficient') state = 'configured_insufficient'
  else if (authConfigured && apiAccessOk === true && benchmarkStatus === 'unavailable') state = 'configured_unavailable'
  else if (authConfigured && apiAccessOk === true) state = 'configured_incomplete'

  return {
    state,
    successRate,
    checks,
    configured: authConfigured,
    healthy: state === 'healthy',
    shouldFailStrictConfigured: authConfigured && state !== 'healthy',
  }
}
