import { describe, expect, it } from 'vitest'
import { buildRegulatoryChecksV4 } from './regulatoryV4'
import { defaultClientProfileV3 } from './regulatoryV3'
import type { ProductAnalysis } from './productAnalysis'
import type { ExpertOverride } from './expertOverride'

const analysis: ProductAnalysis = {
  sourceUrl: 'https://www.alibaba.com/product-detail/unknown', fetched: true,
  product: { name: 'Generic Power Adapter', category: 'Power adapter', unitPriceUsd: 18.5, moq: 200, packedWeightKg: 0.42, volumeCbm: 0.0035, originCountry: 'China', imageUrl: null },
  market: { estimatedPriceArs: null, estimatedMonthlyDemand: 0, source: 'missing' },
  suggestedQuantities: [200, 300, 500],
  confidence: { overall: 60, productSource: 'verified', logistics: 'medium', market: 'low' }, assumptions: [],
}

const override: ExpertOverride = {
  ncm: '8504.40.90', dutyRatePct: 16, supplierUnitPriceUsd: 18.5, moq: 200,
  unitWeightKg: 0.42, unitVolumeCbm: 0.0035, marketPriceArs: 95000, monthlyDemand: 25,
  userCheckedOfficialSource: false, sourceNote: '', evidenceOrigin: 'user_supplied',
}

describe('expert override regulatory traceability', () => {
  it('keeps user-supplied NCM in VERIFY', () => {
    const check = buildRegulatoryChecksV4(analysis, defaultClientProfileV3, override).find((item) => item.id === 'ncm')
    expect(check?.status).toBe('verify')
    expect(check?.title).toContain('8504.40.90')
  })

  it('keeps user-supplied duty in VERIFY even when the user claims an official source check', () => {
    const checked = { ...override, userCheckedOfficialSource: true, sourceNote: 'ARCA Arancel Integrado 14/08/2026' }
    const duty = buildRegulatoryChecksV4(analysis, defaultClientProfileV3, checked).find((item) => item.id === 'duty')
    expect(duty?.status).toBe('verify')
    expect(duty?.detail).toContain('no confirma')
  })

  it('adds an explicit user-supplied evidence warning', () => {
    const evidence = buildRegulatoryChecksV4(analysis, defaultClientProfileV3, override).find((item) => item.id === 'expert-override-evidence')
    expect(evidence?.status).toBe('verify')
    expect(evidence?.detail).toContain('user_supplied')
  })
})
