import { describe, expect, it } from 'vitest'
import { defaultInputs } from '../data/defaults'
import { applyAnalystScenario, buildAnalystContext } from './importAnalyst'
import type { OpportunityDecision } from './opportunityDecision'
import type { ProductAnalysisV2 } from './productAnalysisV2'

const analysis: ProductAnalysisV2 = {
  sourceUrl: 'https://www.alibaba.com/product-detail/test',
  fetched: true,
  product: {
    name: 'Carbon racket', category: 'Padel racket', unitPriceUsd: 25.5, moq: 300,
    packedWeightKg: 0.65, volumeCbm: 0.006, originCountry: 'China', imageUrl: null,
  },
  market: {
    estimatedPriceArs: 220000,
    estimatedMonthlyDemand: 0,
    source: 'Mercado Libre screening',
    details: { p25Ars: 180000, medianArs: 235000, p75Ars: 300000, comparableCount: 12, confidence: 81 },
  } as any,
  fx: { status: 'live', arsPerUsd: 1491.8387, sourceDate: '2026-08-13', source: 'BCRA', code: 'REF', note: 'test' },
  suggestedQuantities: [300, 500],
  confidence: { overall: 80, productSource: 'browser', logistics: 'benchmark', market: 'live-high' },
  assumptions: [],
  customs: {
    ncmCandidate: '9506.59.00', classificationConfidence: 'medium', dutyRatePct: 20,
    dutyRateStatus: 'candidate', statisticsRatePct: 3, statisticsPreferenceStatus: 'none',
    interventionsStatus: 'verify_vuce', source: 'ARCA screening', reviewedAt: '2026-08-13', rationale: [],
  } as any,
}

const decision: OpportunityDecision = {
  verdict: 'attractive', stage: 'instant_screening', label: 'ATTRACTIVE · DEMAND PENDING',
  summary: 'Strong unit economics; demand pending.', evidenceConfidencePct: 72, provisional: true,
  result: {
    quantity: 300, mode: 'sea', supplierUnitUsd: 25.5, freightUsd: 1000, insuranceUsd: 0,
    customsBaseUsd: 8650, importDutyUsd: 1730, statisticsFeeUsd: 259.5, importVatUsd: 0,
    vatPerceptionUsd: 0, gainsPerceptionUsd: 0, iibbPerceptionUsd: 0, cashTaxesUsd: 1989.5,
    potentialCreditsUsd: 0, nonRecoverableTaxCostUsd: 1989.5, economicLandedTotalUsd: 10639.5,
    economicLandedUnitUsd: 35.465, cashRequiredUsd: 10639.5, cashRequiredUnitUsd: 35.465,
    landedTotalUsd: 10639.5, landedUnitUsd: 35.465, marginPct: 0.58, inventoryMonths: 0,
    breakEvenArs: 52912, score: 88, affordable: true, taxAssumptions: [],
  },
  robustCandidate: null,
  reasons: ['Margen fuerte'], warnings: ['Demanda pendiente'], nextActions: ['Ingresar demanda'],
}

describe('AI Import Analyst client boundaries', () => {
  it('builds a compact grounded context from the current scan and decision', () => {
    const inputs = { ...defaultInputs, usdArs: 1491.8387, marketPriceArs: 220000, monthlyDemand: 0, capitalAvailableUsd: 0 }
    const context = buildAnalystContext(analysis, inputs, decision)
    expect(context.product.name).toBe('Carbon racket')
    expect(context.market.p25Ars).toBe(180000)
    expect(context.fx?.arsPerUsd).toBe(1491.8387)
    expect(context.customs.ncmCandidate).toBe('9506.59.00')
    expect(context.decision.breakEvenArs).toBe(52912)
    expect(context.decision.reasons).toEqual(['Margen fuerte'])
  })

  it('applies only user-owned demand and capital assumptions', () => {
    const before = { ...defaultInputs, usdArs: 1491.8387, marketPriceArs: 220000, dutyRatePct: 20 }
    const after = applyAnalystScenario(before, {
      monthlyDemand: 20,
      capitalAvailableUsd: 15000,
      marketPriceArs: 999999,
      dutyRatePct: 0,
    } as any)
    expect(after.monthlyDemand).toBe(20)
    expect(after.capitalAvailableUsd).toBe(15000)
    expect(after.marketPriceArs).toBe(220000)
    expect(after.dutyRatePct).toBe(20)
    expect(after.usdArs).toBe(1491.8387)
  })

  it('ignores invalid scenario values instead of contaminating inputs', () => {
    const before = { ...defaultInputs, monthlyDemand: 12, capitalAvailableUsd: 5000 }
    const after = applyAnalystScenario(before, { monthlyDemand: -1, capitalAvailableUsd: Number.POSITIVE_INFINITY })
    expect(after).toEqual(before)
  })
})
