import { describe, expect, it } from 'vitest'
import { checkDiscoveryConstraints } from './discoveryConstraintCheck'
import type { ProductAnalysisV2 } from './productAnalysisV2'
import type { DiscoveryConstraints } from './productDiscovery'

function analysis(overrides: Partial<ProductAnalysisV2['product']> = {}): ProductAnalysisV2 {
  return {
    sourceUrl: 'https://www.alibaba.com/product-detail/Test_1600000000001.html', fetched: true,
    product: {
      name: 'Carbon Padel Racket', category: 'Padel racket', unitPriceUsd: 25, moq: 100,
      packedWeightKg: 0.65, volumeCbm: 0.006, originCountry: 'China', imageUrl: null, ...overrides,
    },
    market: { estimatedPriceArs: null, estimatedMonthlyDemand: 0, source: 'test' },
    suggestedQuantities: [100, 200], confidence: { overall: 70, productSource: 'live', logistics: 'test', market: 'missing' }, assumptions: [],
    customs: { ncmCandidate: null, classificationConfidence: 'missing', dutyRatePct: null, dutyRateStatus: 'pending', statisticsRatePct: 3, statisticsPreferenceStatus: 'none', interventionsStatus: 'verify_vuce', source: 'test', reviewedAt: '2026-08-17', rationale: [] },
  }
}

const constraints: DiscoveryConstraints = { maxUnitPriceUsd: 30, maxMoq: 100, originCountry: 'China', excludedOriginCountries: [], lowMoqPreference: false }

describe('discovery constraint checks after deep analysis', () => {
  it('passes only constraints supported by deep-read product facts', () => {
    const checks = checkDiscoveryConstraints(analysis(), constraints)
    expect(checks.map((item) => [item.id, item.status])).toEqual([
      ['price', 'pass'], ['moq', 'pass'], ['origin', 'pass'],
    ])
  })

  it('fails price/MOQ/origin independently rather than hiding the mismatch', () => {
    const checks = checkDiscoveryConstraints(analysis({ unitPriceUsd: 35, moq: 250, originCountry: 'Pakistan' }), constraints)
    expect(checks.map((item) => item.status)).toEqual(['fail', 'fail', 'fail'])
  })

  it('keeps a constraint pending when the deep analysis lacks the fact', () => {
    const checks = checkDiscoveryConstraints(analysis({ unitPriceUsd: null, moq: null, originCountry: '' }), constraints)
    expect(checks.map((item) => item.status)).toEqual(['pending', 'pending', 'pending'])
  })

  it('keeps qualified or estimated origin evidence pending instead of treating it as verified', () => {
    expect(checkDiscoveryConstraints(analysis({ originCountry: 'China (estimated)' }), constraints).find((item) => item.id === 'origin')?.status).toBe('pending')
    expect(checkDiscoveryConstraints(analysis({ originCountry: 'China benchmark' }), constraints).find((item) => item.id === 'origin')?.status).toBe('pending')
  })

  it('fails an excluded origin only after the selected listing resolves to that origin', () => {
    const base: DiscoveryConstraints = { maxUnitPriceUsd: null, maxMoq: null, originCountry: null, excludedOriginCountries: ['China'], lowMoqPreference: false }
    expect(checkDiscoveryConstraints(analysis({ originCountry: 'China' }), base)[0].status).toBe('fail')
    expect(checkDiscoveryConstraints(analysis({ originCountry: 'Pakistan' }), base)[0].status).toBe('pass')
    expect(checkDiscoveryConstraints(analysis({ originCountry: '' }), base)[0].status).toBe('pending')
    expect(checkDiscoveryConstraints(analysis({ originCountry: 'China estimated' }), base)[0].status).toBe('pending')
  })

  it('never converts qualitative low-MOQ preference into an invented numeric pass/fail threshold', () => {
    const checks = checkDiscoveryConstraints(analysis({ moq: 300 }), {
      maxUnitPriceUsd: null, maxMoq: null, originCountry: null, excludedOriginCountries: [], lowMoqPreference: true,
    })
    expect(checks).toHaveLength(1)
    expect(checks[0].id).toBe('low_moq')
    expect(checks[0].status).toBe('pending')
    expect(checks[0].detail).toContain('Falta un umbral explícito')
  })
})
