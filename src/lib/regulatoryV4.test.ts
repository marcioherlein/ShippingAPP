import { describe, expect, it } from 'vitest'
import { customsProfileFor } from './customsClassification'
import { buildRegulatoryChecksV4 } from './regulatoryV4'
import { defaultClientProfileV3 } from './regulatoryV3'
import type { ProductAnalysisV2 } from './productAnalysisV2'

function analysis(category: string): ProductAnalysisV2 {
  return {
    sourceUrl: 'https://www.alibaba.com/product-detail/test',
    fetched: true,
    product: { name: category, category, unitPriceUsd: 25, moq: 100, packedWeightKg: 1, volumeCbm: 0.01, originCountry: 'China', imageUrl: null },
    market: { estimatedPriceArs: 100000, estimatedMonthlyDemand: 10, source: 'test' },
    customs: customsProfileFor(category, 'China'),
    suggestedQuantities: [100],
    confidence: { overall: 80, productSource: 'verified', logistics: 'medium', market: 'medium' },
    assumptions: [],
  }
}

const tech = (a: ProductAnalysisV2, client = defaultClientProfileV3) => buildRegulatoryChecksV4(a, client).find((item) => item.id === 'technical-regulation')

describe('product-specific regulatory screening', () => {
  it('marks padel as no specific RT detected but still VERIFY', () => {
    const a = analysis('Padel racket')
    expect(a.customs.technicalRegulationScreening).toBe('no_specific_rt_detected')
    expect(tech(a)?.status).toBe('verify')
    expect(tech(a)?.title.toLowerCase()).toContain('confirmar vuce')
  })

  it('never upgrades no-specific-RT screening to PASS', () => {
    expect(tech(analysis('Padel racket'))?.status).not.toBe('pass')
  })

  it('does not fabricate a technical screening for unsupported categories', () => {
    const a = analysis('Electric appliance')
    expect(a.customs.technicalRegulationScreening).toBe('not_screened')
    expect(tech(a)?.title.toLowerCase()).toContain('determinar si aplica')
  })

  it('respects explicit user evidence over automatic screening', () => {
    const client = { ...defaultClientProfileV3, technicalRegulation: 'applies_pending' as const }
    const result = tech(analysis('Padel racket'), client)
    expect(result?.status).toBe('blocker')
    expect(result?.title.toLowerCase()).toContain('no comercializar')
  })
})
