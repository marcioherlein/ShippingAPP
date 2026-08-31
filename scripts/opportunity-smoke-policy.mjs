const ALLOWED_MODES = new Set(['parsebot', 'direct', 'browser'])

function isCanonicalAlibabaProductUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return false
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return false
    if (!['alibaba.com', 'www.alibaba.com', 'm.alibaba.com'].includes(url.hostname.toLowerCase())) return false
    return /^\/product-detail\//i.test(url.pathname) && /\.html?$/i.test(url.pathname)
  } catch {
    return false
  }
}

function hasCommercialFact(item) {
  return Boolean(
    (Number.isFinite(Number(item?.unitPriceUsd)) && Number(item.unitPriceUsd) > 0)
    || (Number.isFinite(Number(item?.moq)) && Number(item.moq) > 0)
    || (typeof item?.supplierName === 'string' && item.supplierName.trim())
    || (typeof item?.imageUrl === 'string' && item.imageUrl.trim()),
  )
}

function expectedSource(mode) {
  if (mode === 'parsebot') return 'parsebot_search_products'
  if (mode === 'direct') return 'alibaba_direct'
  if (mode === 'browser') return 'alibaba_browser'
  return null
}

export function evaluateOpportunitySearchSmoke(body) {
  const results = Array.isArray(body?.results) ? body.results : []
  const mode = typeof body?.mode === 'string' ? body.mode : ''
  const source = expectedSource(mode)

  const checks = [
    { name: 'status_live', passed: body?.status === 'live' },
    { name: 'supported_live_mode', passed: ALLOWED_MODES.has(mode) },
    { name: 'has_results', passed: results.length >= 1 },
    {
      name: 'all_results_traceable',
      passed: results.length >= 1 && results.every((item) => (
        typeof item?.title === 'string'
        && item.title.trim().length >= 3
        && isCanonicalAlibabaProductUrl(item?.url)
      )),
    },
    {
      name: 'source_matches_mode',
      passed: Boolean(source) && results.length >= 1 && results.every((item) => item?.source === source),
    },
    {
      name: 'provider_specific_evidence',
      passed: mode === 'parsebot'
        ? results.some(hasCommercialFact)
        : (mode === 'direct' || mode === 'browser')
          ? results.every((item) => item?.nextAction === 'analyze_product' && Array.isArray(item?.missingFacts))
          : false,
    },
    {
      name: 'no_synthetic_fallback',
      passed: results.length >= 1 && results.every((item) => (
        item?.source !== 'synthetic'
        && item?.source !== 'generated'
        && !String(item?.url || '').startsWith('data:')
      )),
    },
  ]

  const failedChecks = checks.filter((check) => !check.passed).map((check) => check.name)
  return {
    healthy: failedChecks.length === 0,
    successRate: checks.length ? checks.filter((check) => check.passed).length / checks.length : 0,
    mode,
    resultCount: results.length,
    checks,
    failedChecks,
  }
}

export function enforceOpportunitySearchSmoke(body) {
  const health = evaluateOpportunitySearchSmoke(body)
  if (!health.healthy) {
    throw new Error(`opportunity-search failed evidence gate: ${health.failedChecks.join(', ')}; mode=${health.mode || 'missing'}; status=${body?.status || 'missing'}; results=${health.resultCount}`)
  }
  return health
}
