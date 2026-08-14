import { describe, expect, it } from 'vitest'
import { customsProfileFor } from './customsClassification'
import { mergeFullCustomsProfile, type FullNcmApiResult, type FullSimApiResult } from './fullNcmClient'

function sim(overrides: Partial<FullSimApiResult> = {}): FullSimApiResult {
  return {
    status: 'candidate', ncmCode: '9506.59.00', ncmLabel: 'Raquetas similares',
    candidate: { code: '9506.59.00.900Z', label: 'Las demás', score: 10 },
    alternatives: [{ code: '9506.59.00.100F', label: 'Badminton', score: 0 }],
    confidence: 'medium', rationale: ['sim retrieval'], missingFacts: [], sourceDate: '2026-08-14',
    ...overrides,
  }
}

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
    const merged = mergeFullCustomsProfile(local, full({ sim: sim() }))
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

describe('full SIM vs seed SIM reconciliation', () => {
  it('reinforces the seed SIM when the official full snapshot agrees', () => {
    const local = customsProfileFor('Padel racket', 'China', 'Padel racket')
    const merged = mergeFullCustomsProfile(local, full({ sim: sim({ confidence: 'medium' }) }))
    expect(merged.simOpeningCandidate?.code).toBe('9506.59.00.900Z')
    expect(merged.simSource).toContain('coincidencia')
    expect(merged.dutyRatePct).toBe(20)
  })

  it('clears the automatic SIM suffix on a strong SIM conflict but preserves NCM-level duty screening', () => {
    const local = customsProfileFor('Padel racket', 'China', 'Padel racket')
    const merged = mergeFullCustomsProfile(local, full({ sim: sim({
      candidate: { code: '9506.59.00.100F', label: 'Raquetas de badminton', score: 30 },
      confidence: 'high',
    }) }))
    expect(merged.ncmCandidate).toBe('9506.59.00')
    expect(merged.simOpeningCandidate).toBeNull()
    expect(merged.simOpeningConfidence).toBe('low')
    expect(merged.dutyRatePct).toBe(20)
    expect(merged.missingFacts.join(' ')).toContain('SIM')
  })

  it('does not let a LOW conflicting full SIM displace a strong seed SIM', () => {
    const local = customsProfileFor('Padel racket', 'China', 'Padel racket')
    const merged = mergeFullCustomsProfile(local, full({ sim: sim({
      candidate: { code: '9506.59.00.100F', label: 'Raquetas de badminton', score: 0 },
      confidence: 'low',
    }) }))
    expect(merged.simOpeningCandidate?.code).toBe('9506.59.00.900Z')
    expect(merged.simAlternatives?.some((item) => item.code === '9506.59.00.100F')).toBe(true)
  })

  it('attaches a full SIM candidate for an NCM outside the seed without inventing tariff economics', () => {
    const local = customsProfileFor('Power adapter', 'China', 'USB-C power adapter')
    const merged = mergeFullCustomsProfile(local, full({
      code: '8504.40.90', label: 'Convertidores eléctricos estáticos > Los demás', confidence: 'high',
      sim: sim({
        ncmCode: '8504.40.90', ncmLabel: 'Convertidores estáticos',
        candidate: { code: '8504.40.90.100A', label: 'Para telecomunicaciones', score: 25 },
        alternatives: [], confidence: 'high', status: 'candidate',
      }),
    }))
    expect(merged.ncmCandidate).toBe('8504.40.90')
    expect(merged.simOpeningCandidate?.code).toBe('8504.40.90.100A')
    expect(merged.simOpeningConfidence).toBe('high')
    expect(merged.dutyRatePct).toBeNull()
  })

  it('keeps a LOW full SIM visible as LOW evidence when there is no seed SIM', () => {
    const local = customsProfileFor('Power adapter', 'China', 'USB-C power adapter')
    const merged = mergeFullCustomsProfile(local, full({
      code: '8504.40.90', label: 'Convertidores eléctricos estáticos > Los demás', confidence: 'high',
      sim: sim({
        ncmCode: '8504.40.90', ncmLabel: 'Convertidores estáticos',
        candidate: { code: '8504.40.90.900Z', label: 'Los demás', score: 0 },
        alternatives: [], confidence: 'low',
      }),
    }))
    expect(merged.simOpeningCandidate?.code).toBe('8504.40.90.900Z')
    expect(merged.simOpeningConfidence).toBe('low')
    expect(merged.dutyRatePct).toBeNull()
  })

  it('does not erase a valid seed SIM when full SIM hydration is unavailable', () => {
    const local = customsProfileFor('Padel racket', 'China', 'Padel racket')
    const merged = mergeFullCustomsProfile(local, full({ sim: sim({
      status: 'unavailable', candidate: null, alternatives: [], confidence: 'missing',
      rationale: ['SIM chapter unavailable'],
    }) }))
    expect(merged.simOpeningCandidate?.code).toBe('9506.59.00.900Z')
    expect(merged.simSource).toContain('se conserva')
  })

  it('rejects a SIM candidate that belongs to another NCM even if the API returns it', () => {
    const local = customsProfileFor('Power adapter', 'China', 'USB-C power adapter')
    const merged = mergeFullCustomsProfile(local, full({
      code: '8504.40.90', label: 'Convertidores eléctricos estáticos > Los demás', confidence: 'high',
      sim: sim({
        ncmCode: '8504.40.90', candidate: { code: '9506.59.00.900Z', label: 'Wrong NCM', score: 99 },
        alternatives: [], confidence: 'high',
      }),
    }))
    expect(merged.simOpeningCandidate).toBeNull()
  })
})
