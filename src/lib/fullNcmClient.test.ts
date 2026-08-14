import { describe, expect, it } from 'vitest'
import { customsProfileFor } from './customsClassification'
import { mergeFullCustomsProfile, type FullNcmApiResult } from './fullNcmClient'

function full(overrides: Partial<FullNcmApiResult> = {}): FullNcmApiResult {
  return {
    status: 'candidate', code: '9506.59.00', label: 'Raquetas de tenis, bádminton o similares > Las demás',
    confidence: 'medium', alternatives: [], missingFacts: [], rationale: ['full retrieval'], searchTerms: ['raqueta similar'],
    sourceDate: '2026-08-14', source: 'ARCA Arancel Integrado', catalogRecordCount: 10504, retrievalMode: 'ai_reranked',
    ...overrides,
  }
}

describe('full NCM vs seed reconciliation', () => {
  it('preserves seed duty/SIM only when full catalog agrees on the NCM with usable confidence', () => {
    const local = customsProfileFor('Padel racket', 'China', 'Carbon Fiber Padel Racket')
    const merged = mergeFullCustomsProfile(local, full())
    expect(merged.ncmCandidate).toBe('9506.59.00')
    expect(merged.dutyRatePct).toBe(20)
    expect(merged.simOpeningCandidate?.code).toBe('9506.59.00.900Z')
    expect(merged.catalogScope).toContain('10504')
  })

  it('finds a full-catalog NCM outside the seed but keeps tariff economics blocked', () => {
    const local = customsProfileFor('Power adapter', 'China', 'USB-C 65W power adapter')
    expect(local.ncmCandidate).toBeNull()
    const merged = mergeFullCustomsProfile(local, full({
      code: '8504.40.90', label: 'Convertidores eléctricos estáticos > Los demás', confidence: 'high',
      alternatives: [{ code: '8504.40.30', label: 'Convertidores estáticos específicos', score: 18 }],
    }))
    expect(merged.ncmCandidate).toBe('8504.40.90')
    expect(merged.classificationConfidence).toBe('high')
    expect(merged.dutyRatePct).toBeNull()
    expect(merged.dutyRateStatus).toBe('missing')
    expect(merged.source).toContain('Derecho no resuelto')
  })

  it('turns a strong seed/full disagreement into LOW confidence and blocks economics', () => {
    const local = customsProfileFor('Padel racket', 'China', 'Padel racket')
    const merged = mergeFullCustomsProfile(local, full({ code: '9506.51.00', label: 'Raquetas de tenis', confidence: 'medium' }))
    expect(merged.ncmCandidate).toBe('9506.59.00')
    expect(merged.classificationConfidence).toBe('low')
    expect(merged.dutyRatePct).toBeNull()
    expect(merged.simOpeningCandidate).toBeNull()
    expect(merged.missingFacts.join(' ')).toContain('conflicto')
  })

  it('does not let a LOW full-catalog alternative displace a strong specialized seed', () => {
    const local = customsProfileFor('Padel racket', 'China', 'Padel racket')
    const merged = mergeFullCustomsProfile(local, full({ code: '9506.51.00', label: 'Raquetas de tenis', confidence: 'low' }))
    expect(merged.ncmCandidate).toBe('9506.59.00')
    expect(merged.dutyRatePct).toBe(20)
    expect(merged.alternatives.some((item) => item.code === '9506.51.00')).toBe(true)
  })

  it('keeps the local fail-closed state when full retrieval returns missing', () => {
    const local = customsProfileFor('Power adapter', 'China', 'Mystery adapter')
    const merged = mergeFullCustomsProfile(local, full({ status: 'missing', code: null, label: null, confidence: 'missing', retrievalMode: 'missing' }))
    expect(merged.ncmCandidate).toBeNull()
    expect(merged.dutyRatePct).toBeNull()
    expect(merged.source).toContain('no produjo candidato')
  })

  it('retains unique alternatives from both engines without duplicating the winner', () => {
    const local = customsProfileFor('Racket sports equipment', 'China', 'sport racket paddle')
    const merged = mergeFullCustomsProfile(local, full({
      code: '9506.59.00', confidence: 'medium',
      alternatives: [{ code: '9506.51.00', label: 'Raquetas de tenis', score: 20 }],
    }))
    const codes = merged.alternatives.map((item) => item.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes).not.toContain(merged.ncmCandidate)
  })
})
