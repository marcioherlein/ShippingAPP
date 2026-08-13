import { describe, expect, it } from 'vitest'
import { buildRegulatoryChecksV3, defaultClientProfileV3 } from './regulatoryV3'
import type { ProductAnalysis } from './productAnalysis'

const analysis: ProductAnalysis = {
  sourceUrl: 'https://www.alibaba.com/product-detail/test',
  fetched: true,
  product: { name: 'Carbon Fiber Padel Racket', category: 'Padel racket', unitPriceUsd: 25.5, moq: 300, packedWeightKg: 0.65, volumeCbm: 0.006, originCountry: 'China', imageUrl: null },
  market: { estimatedPriceArs: 200000, estimatedMonthlyDemand: 40, source: 'test' },
  suggestedQuantities: [300],
  confidence: { overall: 80, productSource: 'verified', logistics: 'medium', market: 'medium' },
  assumptions: [],
}

const check = (profile: typeof defaultClientProfileV3, id: string) => buildRegulatoryChecksV3(analysis, profile).find((item) => item.id === id)

describe('regulatory readiness adversarial rules', () => {
  it('treats missing SICNEA as a blocker', () => {
    expect(check({ ...defaultClientProfileV3, sicneaAdhesion: 'no' }, 'sicnea')?.status).toBe('blocker')
  })
  it('keeps SITA distinct from SICNEA', () => {
    const profile = { ...defaultClientProfileV3, sitaAccess: 'no', sicneaAdhesion: 'yes' } as const
    expect(check(profile, 'sita-access')?.status).toBe('verify')
    expect(check(profile, 'sicnea')?.status).toBe('pass')
  })
  it('does not re-block criminal documents once ARCA profile is accepted', () => {
    const profile = { ...defaultClientProfileV3, importerProfile: 'yes', criminalRecordDocs: 'unknown' } as const
    expect(check(profile, 'criminal-docs')?.status).toBe('pass')
  })
  it('blocks an external declarant route without an operative declarant profile', () => {
    const profile = { ...defaultClientProfileV3, declarationRoute: 'customs_broker', declarantProfile: 'no' } as const
    expect(check(profile, 'declarant-profile')?.status).toBe('blocker')
  })
  it('blocks commercialization when a technical regulation applies but conformity is pending', () => {
    const profile = { ...defaultClientProfileV3, technicalRegulation: 'applies_pending' } as const
    expect(check(profile, 'technical-regulation')?.status).toBe('blocker')
  })
  it('marks a confirmed non-applicable technical regulation as passed', () => {
    const profile = { ...defaultClientProfileV3, technicalRegulation: 'not_applicable_confirmed' } as const
    expect(check(profile, 'technical-regulation')?.status).toBe('pass')
  })
  it('blocks a missing TAD channel only while a technical procedure is pending', () => {
    const profile = { ...defaultClientProfileV3, technicalRegulation: 'applies_pending', tadAccess: 'no' } as const
    expect(check(profile, 'tad')?.status).toBe('blocker')
  })
  it('does not re-block completed conformity solely because TAD access is absent', () => {
    const profile = { ...defaultClientProfileV3, technicalRegulation: 'applies_ready', tadAccess: 'no' } as const
    expect(check(profile, 'tad')?.status).toBe('verify')
  })
  it('blocks resale when mandatory commercial labeling is known to be pending', () => {
    const profile = { ...defaultClientProfileV3, purpose: 'resale', labelingReady: 'no' } as const
    expect(check(profile, 'labeling-v3')?.status).toBe('blocker')
  })
  it('never treats origin preference as automatic statistics exemption', () => {
    const item = check(defaultClientProfileV3, 'statistics-v3')
    expect(item?.status).toBe('info')
    expect(item?.detail.toLowerCase()).toContain('no activa una exención automática')
  })
  it('keeps FX timing under bank verification even for MiPyME', () => {
    const profile = { ...defaultClientProfileV3, mipyme: 'yes' } as const
    expect(check(profile, 'fx-v3')?.status).toBe('verify')
  })
})
