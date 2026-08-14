import { describe, expect, it } from 'vitest'
import { automaticEvidenceReady, missingAutomaticEvidence, quantityDecisionReady } from './decisionReadiness'
import type { ProductAnalysisV2 } from './productAnalysisV2'

const analysis: ProductAnalysisV2 = {
  sourceUrl: 'https://www.alibaba.com/product-detail/test', fetched: true,
  product: { name: 'Product', category: 'Padel racket', unitPriceUsd: 25, moq: 300, packedWeightKg: 0.65, volumeCbm: 0.006, originCountry: 'China', imageUrl: null },
  market: { estimatedPriceArs: 200000, estimatedMonthlyDemand: 40, source: 'test' },
  fx: { status: 'live', arsPerUsd: 1491.8387, sourceDate: '2026-08-13', source: 'BCRA · Dólar Referencia Comunicación A 3500', code: 'REF', note: 'test' },
  suggestedQuantities: [300, 500], confidence: { overall: 80, productSource: 'verified', logistics: 'medium', market: 'medium' }, assumptions: [],
  customs: { ncmCandidate: '9506.59.00', classificationConfidence: 'medium', dutyRatePct: 20, dutyRateStatus: 'candidate', statisticsRatePct: 3, statisticsPreferenceStatus: 'none', interventionsStatus: 'verify_vuce', source: 'test', reviewedAt: '2026-08-13' },
}

describe('decision readiness adversarial rules', () => {
  it('accepts complete automatic economic evidence', () => {
    expect(automaticEvidenceReady(analysis)).toBe(true)
    expect(missingAutomaticEvidence(analysis)).toEqual([])
  })

  it('fails closed on missing supplier price', () => {
    expect(missingAutomaticEvidence({ ...analysis, product: { ...analysis.product, unitPriceUsd: null } })).toContain('precio proveedor')
  })

  it('fails closed on missing MOQ', () => {
    expect(missingAutomaticEvidence({ ...analysis, product: { ...analysis.product, moq: null } })).toContain('MOQ')
  })

  it('fails closed on missing packed weight', () => {
    expect(missingAutomaticEvidence({ ...analysis, product: { ...analysis.product, packedWeightKg: 0 } })).toContain('peso embalado')
  })

  it('fails closed on missing volume', () => {
    expect(missingAutomaticEvidence({ ...analysis, product: { ...analysis.product, volumeCbm: 0 } })).toContain('volumen embalado')
  })

  it('fails closed on missing market benchmark', () => {
    expect(missingAutomaticEvidence({ ...analysis, market: { ...analysis.market, estimatedPriceArs: null } })).toContain('benchmark local')
  })

  it('fails closed when BCRA REF is unavailable', () => {
    expect(missingAutomaticEvidence({ ...analysis, fx: { ...analysis.fx!, status: 'unavailable', arsPerUsd: null } })).toContain('USD/ARS BCRA')
    expect(missingAutomaticEvidence({ ...analysis, fx: undefined })).toContain('USD/ARS BCRA')
  })

  it('fails closed on missing duty/classification', () => {
    expect(missingAutomaticEvidence({ ...analysis, customs: { ...analysis.customs, dutyRatePct: null } })).toContain('NCM / derecho')
  })

  it('does not use the market-engine demand field as permission to recommend quantity', () => {
    expect(analysis.market.estimatedMonthlyDemand).toBe(40)
    expect(quantityDecisionReady(true, 0)).toBe(false)
  })

  it('unlocks quantity decisions only after a positive explicit demand hypothesis', () => {
    expect(quantityDecisionReady(true, 25)).toBe(true)
    expect(quantityDecisionReady(false, 25)).toBe(false)
  })

  it('rejects invalid or negative demand', () => {
    expect(quantityDecisionReady(true, -1)).toBe(false)
    expect(quantityDecisionReady(true, Number.NaN)).toBe(false)
  })
})
