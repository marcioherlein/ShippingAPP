import { describe, expect, it } from 'vitest'
import { customsProfileFor } from './customsClassification'
import { mergeFullCustomsProfile, type FullNcmApiResult } from './fullNcmClient'

const fullLowSame: FullNcmApiResult = {
  status: 'candidate',
  code: '9506.59.00',
  label: 'Raquetas de tenis, bádminton o similares > Las demás',
  confidence: 'low',
  alternatives: [],
  missingFacts: ['confirmar tipo exacto de raqueta'],
  rationale: ['full retrieval low'],
  searchTerms: ['raqueta similar'],
  sourceDate: '2026-08-14',
  source: 'ARCA Arancel Integrado',
  catalogRecordCount: 10504,
  retrievalMode: 'ai_reranked',
  sim: null,
}

describe('full NCM same-code reconciliation edge case', () => {
  it('does not list the already-selected seed winner as its own alternative', () => {
    const local = customsProfileFor('Padel racket', 'China', 'Padel racket')
    expect(local.ncmCandidate).toBe('9506.59.00')
    const merged = mergeFullCustomsProfile(local, fullLowSame)
    expect(merged.ncmCandidate).toBe('9506.59.00')
    expect(merged.alternatives.map((item) => item.code)).not.toContain('9506.59.00')
    expect(merged.dutyRatePct).toBe(20)
  })
})
