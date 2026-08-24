import { describe, expect, it } from 'vitest'
import { applyRemoteTariffEvidence } from './ncmTariffClient'
import type { CustomsProfile } from './customsClassification'

const base: CustomsProfile = {
  ncmCandidate: '9506.59.00', simOpeningCandidate: null, simOpeningConfidence: 'missing', simAlternatives: [], simSource: 'test',
  classificationConfidence: 'medium', dutyRatePct: null, dutyRateStatus: 'missing', statisticsRatePct: 3,
  statisticsPreferenceStatus: 'none', interventionsStatus: 'verify_vuce', source: 'full classifier', reviewedAt: '2026-08-14',
  description: 'Raquetas similares', alternatives: [], missingFacts: [], rationale: [], catalogScope: 'full', catalogSourceDate: '2026-08-14',
}

describe('remote NCM tariff merge', () => {
  it('promotes exact normalized tariff only for a strong matching classification', () => {
    const result = applyRemoteTariffEvidence(base, {
      code: '9506.59.00', confidence: 'medium',
      tariff: { status: 'ok', code: '9506.59.00', aecPct: 20, statisticsPct: 3, ivaPct: 21, source: 'normalized xlsx', sourceSha256: 'abcdef1234567890' },
    })
    expect(result.dutyRatePct).toBe(20)
    expect(result.statisticsRatePct).toBe(3)
    expect(result.dutyRateStatus).toBe('candidate')
    expect(result.rationale.join(' ')).toContain('IVA referencia 21%')
  })

  it('does not promote a tariff when classification confidence is low', () => {
    const result = applyRemoteTariffEvidence(base, {
      code: '9506.59.00', confidence: 'low', tariff: { status: 'ok', code: '9506.59.00', aecPct: 20, statisticsPct: 3, ivaPct: 21 },
    })
    expect(result.dutyRatePct).toBeNull()
  })

  it('blocks economics on an exact-source conflict', () => {
    const withPriorDuty = { ...base, dutyRatePct: 20, dutyRateStatus: 'candidate' as const }
    const result = applyRemoteTariffEvidence(withPriorDuty, {
      code: '9506.59.00', confidence: 'high', tariff: { status: 'conflict', code: '9506.59.00' },
    })
    expect(result.dutyRatePct).toBeNull()
    expect(result.dutyRateStatus).toBe('missing')
    expect(result.missingFacts.join(' ')).toContain('conflicto tarifario')
  })

  it('never applies a tariff belonging to another NCM', () => {
    const result = applyRemoteTariffEvidence(base, {
      code: '9506.59.00', confidence: 'high', tariff: { status: 'ok', code: '9506.51.00', aecPct: 1, statisticsPct: 0, ivaPct: 10.5 },
    })
    expect(result.dutyRatePct).toBeNull()
  })
})
