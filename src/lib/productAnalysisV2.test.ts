import { describe, expect, it } from 'vitest'
import { defaultInputs } from '../data/defaults'
import { applyAnalysisV2, type ProductAnalysisV2 } from './productAnalysisV2'
import { customsProfileFor } from './customsClassification'

function analysisWithCustoms(customs: ProductAnalysisV2['customs']): ProductAnalysisV2 {
  return {
    sourceUrl: 'https://www.alibaba.com/product-detail/test',
    fetched: true,
    product: {
      name: 'Test product', category: 'Racket sports equipment', unitPriceUsd: 10, moq: 100,
      packedWeightKg: 0.5, volumeCbm: 0.004, originCountry: 'China', imageUrl: null,
    },
    market: { estimatedPriceArs: null, estimatedMonthlyDemand: 0, source: 'test' },
    suggestedQuantities: [100, 200],
    confidence: { overall: 50, productSource: 'test', logistics: 'test', market: 'missing' },
    assumptions: [],
    customs,
  }
}

describe('ProductAnalysisV2 customs state isolation', () => {
  it('clears a prior product duty when the new classification withholds duty', () => {
    const previous = { ...defaultInputs, dutyRatePct: 35, dutyRateVerified: true }
    const low = customsProfileFor('Racket sports equipment', 'China', 'sport racket paddle')
    expect(low.classificationConfidence).toBe('low')
    expect(low.dutyRatePct).toBeNull()

    const applied = applyAnalysisV2(previous, analysisWithCustoms(low))
    expect(applied.dutyRatePct).toBe(0)
    expect(applied.dutyRatePct).not.toBe(35)
    expect(applied.dutyRateVerified).toBe(false)
  })

  it('replaces a prior duty with a supported new candidate', () => {
    const previous = { ...defaultInputs, dutyRatePct: 35, dutyRateVerified: true }
    const padel = customsProfileFor('Padel racket', 'China', 'Carbon Fiber Padel Racket')
    expect(padel.dutyRatePct).toBe(20)

    const applied = applyAnalysisV2(previous, analysisWithCustoms(padel))
    expect(applied.dutyRatePct).toBe(20)
    expect(applied.dutyRateVerified).toBe(false)
  })
})
