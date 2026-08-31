import { describe, expect, it } from 'vitest'
import { collectAlibabaPriceIntegrityFailures, evaluateAlibabaProbePriceIntegrity } from './alibaba-self-smoke-policy.mjs'

describe('Alibaba production price integrity sentinel', () => {
  it('allows null because missing supplier price must fail closed to confirmation', () => {
    expect(evaluateAlibabaProbePriceIntegrity({ price: null, minimumTrustedPriceUsd: 10 })).toEqual({
      passed: true,
      reason: 'missing_price_fail_closed',
    })
  })

  it.each([1, 0.99, 2.5, 9.99])('rejects implausibly low positive price %s on a known regression fixture', (price) => {
    const result = evaluateAlibabaProbePriceIntegrity({ price, minimumTrustedPriceUsd: 10 })
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('implausibly_low_fixture_price')
  })

  it('accepts a plausible positive fixture price without asserting that it is the correct market price', () => {
    expect(evaluateAlibabaProbePriceIntegrity({ price: 87, minimumTrustedPriceUsd: 10 })).toEqual({
      passed: true,
      reason: 'positive_price_above_fixture_floor',
      observedPriceUsd: 87,
      minimumTrustedPriceUsd: 10,
    })
  })

  it('does not impose the regression rule on fixtures without an explicit floor', () => {
    expect(evaluateAlibabaProbePriceIntegrity({ price: 1, minimumTrustedPriceUsd: null })).toEqual({
      passed: true,
      reason: 'no_fixture_floor',
    })
  })

  it('collects only actual price-integrity failures', () => {
    const failures = collectAlibabaPriceIntegrityFailures([
      { id: 'watch', priceIntegrity: { passed: true } },
      { id: 'doorbell', priceIntegrity: { passed: false } },
    ])
    expect(failures.map((item: any) => item.id)).toEqual(['doorbell'])
  })
})
