import { describe, expect, it } from 'vitest'
import { customsProfileFor } from './customsClassification'

describe('customs classification adversarial integration', () => {
  it('allows a well-supported padel candidate to feed screening economics', () => {
    const profile = customsProfileFor('Padel racket', 'China', 'Carbon Fiber Padel Racket')
    expect(profile.ncmCandidate).toBe('9506.59.00')
    expect(['high', 'medium']).toContain(profile.classificationConfidence)
    expect(profile.dutyRatePct).toBe(20)
    expect(profile.simOpeningCandidate?.code).toBe('9506.59.00.900Z')
  })

  it('keeps a low-confidence candidate visible but blocks its duty from economics', () => {
    const profile = customsProfileFor('Racket sports equipment', 'China', 'sport racket paddle')
    expect(profile.ncmCandidate).not.toBeNull()
    expect(profile.classificationConfidence).toBe('low')
    expect(profile.dutyRatePct).toBeNull()
    expect(profile.dutyRateStatus).toBe('missing')
    expect(profile.source).toContain('Confidence LOW')
  })

  it('fails closed for a product outside pilot coverage', () => {
    const profile = customsProfileFor('Power adapter', 'China', 'USB-C 65W power adapter')
    expect(profile.ncmCandidate).toBeNull()
    expect(profile.dutyRatePct).toBeNull()
    expect(profile.classificationConfidence).toBe('missing')
  })

  it('never lets origin change the NCM candidate', () => {
    const china = customsProfileFor('Padel racket', 'China', 'Padel racket')
    const brazil = customsProfileFor('Padel racket', 'Brazil', 'Padel racket')
    expect(china.ncmCandidate).toBe(brazil.ncmCandidate)
    expect(china.statisticsPreferenceStatus).toBe('none')
    expect(brazil.statisticsPreferenceStatus).toBe('verify_origin')
  })

  it('never treats possible Mercosur origin as an automatic preference', () => {
    const profile = customsProfileFor('Padel racket', 'Uruguay', 'Padel racket')
    expect(profile.statisticsPreferenceStatus).toBe('verify_origin')
    expect(profile.statisticsRatePct).toBe(3)
  })
})
