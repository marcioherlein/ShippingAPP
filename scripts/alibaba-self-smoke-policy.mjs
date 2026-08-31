function positiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * Regression-only price sentinel for known live Alibaba fixtures.
 * A missing price is allowed because ShippingAPP must fail closed to user/provider
 * confirmation. A positive price below the fixture-specific floor is not allowed:
 * these products previously surfaced promotional USD 1 as supplier FOB.
 * This is deliberately not a generic marketplace pricing rule.
 */
export function evaluateAlibabaProbePriceIntegrity({ price, minimumTrustedPriceUsd }) {
  const floor = Number(minimumTrustedPriceUsd)
  if (!Number.isFinite(floor) || floor <= 0) {
    return { passed: true, reason: 'no_fixture_floor' }
  }
  if (!positiveNumber(price)) {
    return { passed: true, reason: 'missing_price_fail_closed' }
  }
  if (price < floor) {
    return {
      passed: false,
      reason: 'implausibly_low_fixture_price',
      observedPriceUsd: price,
      minimumTrustedPriceUsd: floor,
    }
  }
  return {
    passed: true,
    reason: 'positive_price_above_fixture_floor',
    observedPriceUsd: price,
    minimumTrustedPriceUsd: floor,
  }
}

export function collectAlibabaPriceIntegrityFailures(results) {
  return (Array.isArray(results) ? results : []).filter((item) => item?.priceIntegrity?.passed === false)
}
