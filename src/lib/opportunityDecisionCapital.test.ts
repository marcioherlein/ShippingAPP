import { describe, expect, it } from 'vitest'
import { defaultInputs } from '../data/defaults'
import { customsProfileFor } from './customsClassification'
import { buildOpportunityDecision } from './opportunityDecision'
import type { ProductAnalysisV2 } from './productAnalysisV2'
import type { ScenarioTaxContext } from './types'

const context: ScenarioTaxContext = {
  entityType: 'company', taxStatus: 'responsable_inscripto', purpose: 'resale',
  statisticsExempt: false, vatPerceptionExempt: false, gainsPerceptionExempt: false,
}

const analysis: ProductAnalysisV2 = {
  sourceUrl: 'https://www.alibaba.com/product-detail/test.html', fetched: true,
  product: { name: 'Carbon Fiber Padel Racket', category: 'Padel racket', unitPriceUsd: 25.5, moq: 300, packedWeightKg: 0.65, volumeCbm: 0.006, originCountry: 'China', imageUrl: null },
  market: { estimatedPriceArs: 220000, estimatedMonthlyDemand: 0, source: 'live', details: { status: 'live', confidence: 82, p25Ars: 180000 } } as any,
  suggestedQuantities: [300, 500, 1000],
  confidence: { overall: 80, productSource: 'live', logistics: 'benchmark', market: 'live-high' },
  assumptions: [],
  customs: customsProfileFor('Padel racket', 'China', 'Carbon Fiber Padel Racket'),
}

const baseInputs = {
  ...defaultInputs,
  quantities: [300, 500, 1000],
  priceTiers: [{ minQuantity: 300, unitPriceUsd: 25.5 }],
  weightKg: 0.65,
  volumeCbm: 0.006,
  dutyRatePct: 20,
  marketPriceArs: 220000,
  usdArs: 1000,
  capitalAvailableUsd: 0,
}

describe('Opportunity Decision missing-capital boundaries', () => {
  it('does not treat absent capital as a financing failure in instant screening', () => {
    const decision = buildOpportunityDecision({ analysis, inputs: { ...baseInputs, monthlyDemand: 0 }, taxContext: context, economicsReady: true })
    expect(decision.verdict).toBe('attractive')
    expect(decision.warnings.join(' ')).toContain('Capital no informado')
    expect(decision.nextActions.join(' ')).toContain('capital disponible')
  })

  it('never claims capital robustness when robust economics are attractive but capital is unknown', () => {
    const decision = buildOpportunityDecision({ analysis, inputs: { ...baseInputs, monthlyDemand: 45 }, taxContext: context, economicsReady: true, marketP25Ars: 180000 })
    expect(decision.stage).toBe('robust_decision')
    if (decision.verdict === 'attractive') {
      expect(decision.label).toContain('CAPITAL UNCHECKED')
      expect(decision.summary).toContain('factibilidad de capital')
    }
    expect(decision.warnings.join(' ')).toContain('Capital no informado')
  })
})
