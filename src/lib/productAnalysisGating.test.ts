import { describe, expect, it } from 'vitest'
import { customsProfileFor, type CustomsProfile, type NcmTariffProfile } from './customsClassification'
import {
  hasConfirmedClassification,
  hasProvisionalClassification,
  effectiveDutyRatePct,
  effectiveTariffProfile,
} from './productAnalysisV2'

const bareBase = customsProfileFor('', '', '')

const confirmedTariff: NcmTariffProfile = {
  aecPct: 16, diePct: 16, tePct: 3, diiPct: 0, vatPct: 21, vatAdditionalPct: 20,
  gainsPct: 6, iibbPct: 2.5, internalTax: null, capitalGoodEligible: false,
}
const provisionalTariff: NcmTariffProfile = { ...confirmedTariff, diePct: 20 }

const confirmed: CustomsProfile = {
  ...bareBase,
  ncmCandidate: '9506.51.00',
  classificationConfidence: 'high',
  dutyRatePct: 16,
  dutyRateStatus: 'candidate',
  tariff: confirmedTariff,
}

const provisional: CustomsProfile = {
  ...bareBase,
  ncmCandidate: null,
  classificationConfidence: 'low',
  dutyRatePct: null,
  dutyRateStatus: 'missing',
  provisional: true,
  provisionalDutyRatePct: 20,
  provisionalTariff,
}

const unclassified: CustomsProfile = {
  ...bareBase,
  ncmCandidate: null,
  classificationConfidence: 'low',
  dutyRatePct: null,
  dutyRateStatus: 'missing',
}

describe('productAnalysisV2 classification gating', () => {
  it('recognises a confirmed high/medium classification only', () => {
    expect(hasConfirmedClassification(confirmed)).toBe(true)
    expect(hasConfirmedClassification(provisional)).toBe(false)
    expect(hasConfirmedClassification(unclassified)).toBe(false)
  })

  it('recognises a provisional estimate (provisional + duty) without confirming it', () => {
    expect(hasProvisionalClassification(provisional)).toBe(true)
    expect(hasProvisionalClassification(confirmed)).toBe(false)
    expect(hasProvisionalClassification(unclassified)).toBe(false)
  })

  it('effectiveDutyRatePct prefers confirmed, falls back to provisional, else null', () => {
    expect(effectiveDutyRatePct(confirmed)).toBe(16)
    expect(effectiveDutyRatePct(provisional)).toBe(20)
    expect(effectiveDutyRatePct(unclassified)).toBeNull()
  })

  it('effectiveTariffProfile mirrors the same precedence', () => {
    expect(effectiveTariffProfile(confirmed)).toBe(confirmedTariff)
    expect(effectiveTariffProfile(provisional)).toBe(provisionalTariff)
    expect(effectiveTariffProfile(unclassified)).toBeNull()
  })

  it('keeps the fail-closed invariant: provisional never sets dutyRatePct', () => {
    expect(provisional.dutyRatePct).toBeNull()
    expect(provisional.dutyRateStatus).toBe('missing')
  })
})
