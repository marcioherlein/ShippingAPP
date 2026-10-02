import { describe, expect, it } from 'vitest'
import { customsProfileFor, type NcmTariffProfile } from './customsClassification'
import { mergeFullCustomsProfile, type FullNcmApiResult } from './fullNcmClient'

const provisionalTariff: NcmTariffProfile = {
  aecPct: 20, diePct: 20, tePct: 3, diiPct: 0, vatPct: 21, vatAdditionalPct: 20,
  gainsPct: 6, iibbPct: 2.5, internalTax: null, capitalGoodEligible: false,
}

// A missing-status full result that still carries a conservative best-effort estimate.
const fullMissingWithProvisional: FullNcmApiResult = {
  status: 'missing',
  code: null,
  label: null,
  confidence: 'missing',
  alternatives: [],
  missingFacts: ['confirmar material'],
  rationale: ['full retrieval sin candidato suficiente'],
  searchTerms: ['producto generico'],
  sourceDate: '2026-08-14',
  source: 'ARCA Arancel Integrado',
  catalogRecordCount: 10504,
  retrievalMode: 'deterministic_fallback',
  sim: null,
  provisional: true,
  provisionalCode: '8479.89.99',
  provisionalLabel: 'Máquinas y aparatos mecánicos > Los demás',
  provisionalTariff,
  provisionalBasis: 'Derecho más alto entre los candidatos de la shortlist (conservador).',
  disambiguation: {
    candidates: [{ code: '8479.89.99', label: 'A > B', plainLabel: 'Los demás', score: 1 }],
    questions: [],
  },
}

describe('fullNcmClient provisional carry (fail-closed preserved)', () => {
  it('copies provisional fields while keeping dutyRatePct null', () => {
    const local = customsProfileFor('', 'China', 'cosa rara sin clasificar')
    const merged = mergeFullCustomsProfile(local, fullMissingWithProvisional)

    // Fail-closed contract intact: no confirmed duty, no promoted NCM.
    expect(merged.dutyRatePct).toBeNull()
    expect(merged.dutyRateStatus).toBe('missing')

    // Best-effort siblings carried through for the UI to show a labeled estimate.
    expect(merged.provisional).toBe(true)
    expect(merged.provisionalDutyRatePct).toBe(20)
    expect(merged.provisionalTariff).toEqual(provisionalTariff)
    expect(merged.provisionalCode).toBe('8479.89.99')
    expect(merged.provisionalBasis).toContain('conservador')
    expect(merged.disambiguation?.candidates[0].plainLabel).toBe('Los demás')
  })

  it('leaves provisional false/duty null when the full result carries no estimate', () => {
    const local = customsProfileFor('', 'China', 'otra cosa sin clasificar')
    const merged = mergeFullCustomsProfile(local, { ...fullMissingWithProvisional, provisional: false, provisionalTariff: null })
    expect(merged.provisional).toBe(false)
    expect(merged.provisionalDutyRatePct).toBeNull()
    expect(merged.dutyRatePct).toBeNull()
  })
})
