import { describe, expect, it } from 'vitest'
import { checkDiscoveryConstraints } from './discoveryConstraintCheck'
import type { ProductAnalysisV2 } from './productAnalysisV2'
import type { DiscoveryConstraints } from './productDiscovery'

function analysis(overrides: Partial<ProductAnalysisV2['product']> = {}): ProductAnalysisV2 {
  return {
    sourceUrl: 'https://www.alibaba.com/product-detail/Test_1600000000001.html', fetched: true,
    product: { name: 'Carbon Padel Racket', category: 'Padel racket', unitPriceUsd: 25, moq: 100, packedWeightKg: 0.65, volumeCbm: 0.006, originCountry: 'China', imageUrl: null, ...overrides },
    market: { estimatedPriceArs: null, estimatedMonthlyDemand: 0, source: 'test' },
    suggestedQuantities: [100, 200], confidence: { overall: 70, productSource: 'live', logistics: 'test', market: 'missing' }, assumptions: [],
    customs: { ncmCandidate: null, classificationConfidence: 'missing', dutyRatePct: null, dutyRateStatus: 'pending', statisticsRatePct: 3, statisticsPreferenceStatus: 'none', interventionsStatus: 'verify_vuce', source: 'test', reviewedAt: '2026-08-17', rationale: [] },
  }
}

const constraints: DiscoveryConstraints = { maxUnitPriceUsd: 30, maxMoq: 100, originCountry: 'China', excludedOriginCountries: [], lowMoqPreference: false, availableCapitalUsd: null }

describe('discovery constraint checks after deep analysis', () => {
  it('passes only constraints supported by deep-read product facts', () => {
    expect(checkDiscoveryConstraints(analysis(), constraints).map((item) => [item.id, item.status])).toEqual([['price', 'pass'], ['moq', 'pass'], ['origin', 'pass']])
  })
  it('fails price/MOQ/origin independently', () => {
    expect(checkDiscoveryConstraints(analysis({ unitPriceUsd: 35, moq: 250, originCountry: 'Pakistan' }), constraints).map((item) => item.status)).toEqual(['fail', 'fail', 'fail'])
  })
  it('keeps missing facts pending', () => {
    expect(checkDiscoveryConstraints(analysis({ unitPriceUsd: null, moq: null, originCountry: '' }), constraints).map((item) => item.status)).toEqual(['pending', 'pending', 'pending'])
  })
  it('keeps qualified origin pending', () => {
    expect(checkDiscoveryConstraints(analysis({ originCountry: 'China estimated' }), constraints).find((item) => item.id === 'origin')?.status).toBe('pending')
  })
  it('verifies excluded origins only from clean deep facts', () => {
    const base: DiscoveryConstraints = { maxUnitPriceUsd: null, maxMoq: null, originCountry: null, excludedOriginCountries: ['China'], lowMoqPreference: false, availableCapitalUsd: null }
    expect(checkDiscoveryConstraints(analysis({ originCountry: 'China' }), base)[0].status).toBe('fail')
    expect(checkDiscoveryConstraints(analysis({ originCountry: 'Pakistan' }), base)[0].status).toBe('pass')
    expect(checkDiscoveryConstraints(analysis({ originCountry: 'China estimated' }), base)[0].status).toBe('pending')
  })
  it('never converts qualitative low-MOQ preference into a numeric threshold', () => {
    const checks = checkDiscoveryConstraints(analysis({ moq: 300 }), { maxUnitPriceUsd: null, maxMoq: null, originCountry: null, excludedOriginCountries: [], lowMoqPreference: true, availableCapitalUsd: null })
    expect(checks[0].status).toBe('pending')
  })
  it('does not treat user capital as a product attribute check', () => {
    const checks = checkDiscoveryConstraints(analysis(), { ...constraints, maxUnitPriceUsd: null, maxMoq: null, originCountry: null, availableCapitalUsd: 10000 })
    expect(checks).toEqual([])
  })
})
