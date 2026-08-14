import { describe, expect, it } from 'vitest'
import { defaultInputs } from '../data/defaults'
import { customsProfileFor } from './customsClassification'
import { buildOpportunityDecision } from './opportunityDecision'
import type { ProductAnalysisV2 } from './productAnalysisV2'
import type { Inputs, ScenarioTaxContext } from './types'

const context: ScenarioTaxContext = {
  entityType: 'company', taxStatus: 'responsable_inscripto', purpose: 'resale',
  statisticsExempt: false, vatPerceptionExempt: false, gainsPerceptionExempt: false,
}

function analysis(overrides: Partial<ProductAnalysisV2> = {}): ProductAnalysisV2 {
  return {
    sourceUrl: 'https://www.alibaba.com/product-detail/test.html',
    fetched: true,
    product: {
      name: 'Carbon Fiber Padel Racket', category: 'Padel racket', unitPriceUsd: 25.5, moq: 300,
      packedWeightKg: 0.65, volumeCbm: 0.006, originCountry: 'China', imageUrl: null,
    },
    market: {
      estimatedPriceArs: 220000,
      estimatedMonthlyDemand: 0,
      source: 'Mercado Libre screening',
      details: { status: 'live', confidence: 82, p25Ars: 180000, medianArs: 235000, p75Ars: 300000 },
    } as any,
    suggestedQuantities: [300, 500, 1000],
    confidence: { overall: 80, productSource: 'live', logistics: 'benchmark', market: 'live-high' },
    assumptions: [],
    customs: customsProfileFor('Padel racket', 'China', 'Carbon Fiber Padel Racket'),
    ...overrides,
  }
}

function inputs(overrides: Partial<Inputs> = {}): Inputs {
  return {
    ...defaultInputs,
    quantities: [300, 500, 1000],
    priceTiers: [{ minQuantity: 300, unitPriceUsd: 25.5 }],
    weightKg: 0.65,
    volumeCbm: 0.006,
    dutyRatePct: 20,
    dutyRateVerified: false,
    marketPriceArs: 220000,
    usdArs: 1000,
    monthlyDemand: 0,
    capitalAvailableUsd: 0,
    ...overrides,
  }
}

describe('Opportunity Decision Engine', () => {
  it('fails closed when critical economics evidence is missing', () => {
    const broken = analysis({ product: { ...analysis().product, unitPriceUsd: null } })
    const decision = buildOpportunityDecision({ analysis: broken, inputs: inputs(), taxContext: context, economicsReady: false })
    expect(decision.verdict).toBe('incomplete')
    expect(decision.summary).toContain('precio proveedor')
    expect(decision.result).toBeNull()
  })

  it('can flag strong unit economics immediately but keeps the verdict provisional without demand', () => {
    const decision = buildOpportunityDecision({ analysis: analysis(), inputs: inputs(), taxContext: context, economicsReady: true, marketP25Ars: 180000 })
    expect(decision.stage).toBe('instant_screening')
    expect(decision.verdict).toBe('attractive')
    expect(decision.provisional).toBe(true)
    expect(decision.label).toContain('DEMAND PENDING')
    expect(decision.nextActions.join(' ')).toContain('demanda')
  })

  it('rejects genuinely weak unit economics even before demand is supplied', () => {
    const weak = inputs({ marketPriceArs: 40000 })
    const a = analysis({ market: { ...(analysis().market as any), estimatedPriceArs: 40000 } as any })
    const decision = buildOpportunityDecision({ analysis: a, inputs: weak, taxContext: context, economicsReady: true })
    expect(decision.verdict).toBe('avoid')
    expect(decision.result?.marginPct).toBeLessThan(0.15)
  })

  it('treats capital as optional, but if explicitly supplied and far below MOQ cash it can block the opportunity for this user', () => {
    const decision = buildOpportunityDecision({ analysis: analysis(), inputs: inputs({ capitalAvailableUsd: 1000 }), taxContext: context, economicsReady: true })
    expect(decision.verdict).toBe('avoid')
    expect(decision.label).toContain('CURRENT CAPITAL')
    expect(decision.reasons.join(' ')).toContain('queda corto')
  })

  it('upgrades to a robust decision only after explicit demand and survives a reasonable P25 stress', () => {
    const decision = buildOpportunityDecision({
      analysis: analysis(),
      inputs: inputs({ monthlyDemand: 45, capitalAvailableUsd: 25000 }),
      taxContext: context,
      economicsReady: true,
      marketP25Ars: 180000,
    })
    expect(decision.stage).toBe('robust_decision')
    expect(decision.provisional).toBe(false)
    expect(decision.robustCandidate).not.toBeNull()
    expect(['attractive', 'borderline']).toContain(decision.verdict)
    expect(decision.reasons.join(' ')).toContain('Robust score')
  })

  it('does not call a case attractive when the observed price floor truly destroys downside margin', () => {
    const decision = buildOpportunityDecision({
      analysis: analysis(),
      inputs: inputs({ monthlyDemand: 30, capitalAvailableUsd: 25000 }),
      taxContext: context,
      economicsReady: true,
      marketP25Ars: 40000,
    })
    expect(decision.stage).toBe('robust_decision')
    expect(decision.verdict).not.toBe('attractive')
    expect(decision.robustCandidate?.worstMarginPct).toBeLessThan(0.15)
  })

  it('never lets a P25 above the current screening price create an artificial upside stress', () => {
    const decision = buildOpportunityDecision({
      analysis: analysis(),
      inputs: inputs({ monthlyDemand: 40, capitalAvailableUsd: 25000 }),
      taxContext: context,
      economicsReady: true,
      marketP25Ars: 300000,
    })
    expect(decision.robustCandidate?.scenarioResults.some((item) => item.id === 'price_floor')).toBe(false)
  })
})
