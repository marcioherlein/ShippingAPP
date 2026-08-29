import { describe, expect, it } from 'vitest'
import { canonicalToken, classifyFullNcm, retrieveNcmCandidates, sanitizeAiRanking, type NcmSearchIndex } from './ncmRetrieval'

const index: NcmSearchIndex = {
  meta: {
    source: 'ARCA Arancel Integrado', sourceFile: 'nomenclador_14082026.txt', sourceDate: '2026-08-14',
    parserSchema: 2, indexSchema: 3, recordCount: 10504, tariffDataIncluded: false,
    simOpeningsIncluded: false, recordShape: '[ncmCode,label]',
  },
  records: [
    ['0101.30.00', ''],
    ['4707.90.00', 'Papel o cartón para reciclar (desperdicios y desechos) > Los demás'],
    ['9101.21.00', 'Relojes de pulsera con caja de metal precioso > Los demás relojes de pulsera > Automáticos'],
    ['9102.21.00', 'Relojes de pulsera, bolsillo y similares, excepto los de la partida 91.01 > Los demás relojes de pulsera > Automáticos'],
    ['9506.59.00', 'Raquetas de tenis, bádminton o similares, incluso sin cordaje > Las demás', 20, 20, 3, 0, 21, 20, 6, 2.5, null, false],
    ['9506.40.00', 'Artículos y material para tenis de mesa'],
    ['9506.51.00', 'Raquetas de tenis, incluso sin cordaje'],
    ['8504.40.90', 'Transformadores eléctricos, convertidores eléctricos estáticos y bobinas de reactancia > Convertidores estáticos > Los demás'],
    ['8507.60.00', 'Acumuladores eléctricos > De iones de litio'],
    ['4202.92.00', 'Bolsos, mochilas y continentes similares > Con superficie exterior de hojas de plástico o materia textil'],
  ],
}

function fakeAi(outputs: unknown[]) {
  let i = 0
  return { run: async () => ({ response: JSON.stringify(outputs[i++] ?? {}) }) }
}

const exactWatchFacts = {
  name: 'Fully Automatic Mechanical Watches 42.5MM Green Dial Waterproof 100m Stainless Steel Wristwatch',
  category: 'Mechanical Watches',
  material: 'Stainless Steel',
  functionText: 'Automatic mechanical wristwatch for timekeeping',
  description: 'Movement: Automatic Mechanical; Case Material: Stainless Steel',
}

describe('full NCM deterministic retrieval', () => {
  it('retrieves the racket family from Spanish customs vocabulary', () => {
    const result = retrieveNcmCandidates(index, ['raqueta deportiva', 'bádminton similar'], { name: 'padel racket' })
    expect(result[0]?.code).toBe('9506.59.00')
  })

  it('retrieves static converters for a power adapter query expansion', () => {
    const result = retrieveNcmCandidates(index, ['convertidor eléctrico estático', 'fuente alimentación'], { name: 'USB-C power adapter' })
    expect(result.some((item) => item.code === '8504.40.90')).toBe(true)
    expect(result[0]?.code).toBe('8504.40.90')
  })

  it('canonicalizes ordinary Spanish plural forms without damaging tenis', () => {
    expect(canonicalToken('raquetas')).toBe('raqueta')
    expect(canonicalToken('similares')).toBe('similar')
    expect(canonicalToken('convertidores')).toBe('convertidor')
    expect(canonicalToken('tenis')).toBe('tenis')
  })

  it('never returns an official row whose source label is empty', () => {
    const result = retrieveNcmCandidates(index, ['animal vivo asno', 'asno vivo'], { name: 'asno' })
    expect(result.some((item) => item.code === '0101.30.00')).toBe(false)
  })

  it('does not return candidates for generic stopword-only input', () => {
    expect(retrieveNcmCandidates(index, ['producto', 'material'], { name: 'product' })).toEqual([])
  })

  it('never lets an AI-invented code enter the sanitized ranking', () => {
    const shortlist = retrieveNcmCandidates(index, ['raqueta deportiva', 'bádminton similar'], { name: 'padel racket' })
    const ranking = sanitizeAiRanking({ ranking: [
      { code: '9999.99.99', reason: 'invented' },
      { code: '9506.59.00', reason: 'allowed' },
    ], confidence: 'high' }, shortlist)
    expect(ranking.ranking.map((item) => item.code)).toEqual(['9506.59.00'])
  })

  it('deduplicates AI rankings and ignores malformed entries', () => {
    const shortlist = retrieveNcmCandidates(index, ['raqueta deportiva', 'bádminton similar'], { name: 'padel racket' })
    const ranking = sanitizeAiRanking({ ranking: [
      { code: '9506.59.00' }, { code: '9506.59.00' }, { code: 123 }, null,
    ] }, shortlist)
    expect(ranking.ranking).toHaveLength(1)
  })

  it('chapter-gates conventional wristwatches so chapter 47 is computationally impossible', () => {
    const result = retrieveNcmCandidates(
      index,
      ['reloj de pulsera automatico', 'papel carton reciclado desperdicios'],
      exactWatchFacts,
      25,
    )
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((candidate) => candidate.code.startsWith('91'))).toBe(true)
    expect(result.some((candidate) => candidate.code === '4707.90.00')).toBe(false)
  })
})

describe('full NCM AI-constrained classification', () => {
  it('classifies the exact incident watch as 9102.21.00 without asking AI to choose a chapter', async () => {
    let aiCalls = 0
    const ai = { run: async () => { aiCalls += 1; throw new Error('AI should not be called for deterministic watch') } }
    const result = await classifyFullNcm(index, ai, exactWatchFacts)
    expect(aiCalls).toBe(0)
    expect(result.status).toBe('candidate')
    expect(result.code).toBe('9102.21.00')
    expect(result.confidence).toBe('medium')
    expect(result.rationale.join(' ')).toContain('mecánico automático')
    expect(result.code?.startsWith('47')).toBe(false)
  })

  it('classifies a power adapter using AI vocabulary but only an official shortlist code', async () => {
    const ai = fakeAi([
      { searchTerms: ['convertidor eléctrico estático', 'fuente de alimentación eléctrica'], missingFacts: [] },
      { ranking: [{ code: '8504.40.90', reason: 'La función principal es conversión estática de energía.' }], confidence: 'high', missingFacts: ['confirmar tensión y tipo de conversión'] },
    ])
    const result = await classifyFullNcm(index, ai, { name: 'USB-C 65W power adapter', category: 'Power adapter' })
    expect(result.code).toBe('8504.40.90')
    expect(result.status).toBe('candidate')
    expect(result.sourceDate).toBe('2026-08-14')
    expect(result.catalogRecordCount).toBe(10504)
    expect(result.missingFacts).toContain('confirmar tensión y tipo de conversión')
  })

  it('fails closed when an AI-invented winner leaves no trusted rerank', async () => {
    const ai = fakeAi([
      { searchTerms: ['raqueta deportiva', 'bádminton similar'], missingFacts: [] },
      { ranking: [{ code: '1234.56.78', reason: 'hallucinated' }], confidence: 'high' },
    ])
    const result = await classifyFullNcm(index, ai, { name: 'Carbon padel racket', category: 'Padel racket' })
    expect(result.status).toBe('missing')
    expect(result.code).toBeNull()
    expect(result.retrievalMode).toBe('missing')
    expect(result.confidence).toBe('low')
    expect(result.tariff).toBeNull()
  })

  it('fails closed and releases no tariff when AI and deterministic retrieval disagree', async () => {
    const ai = fakeAi([
      { searchTerms: ['raqueta tenis deportiva', 'raqueta similar bádminton'], missingFacts: [] },
      { ranking: [{ code: '9506.51.00', reason: 'AI prefers tennis' }, { code: '9506.59.00' }], confidence: 'high' },
    ])
    const result = await classifyFullNcm(index, ai, { name: 'ambiguous racket', category: 'racket sport' })
    expect(result.status).toBe('missing')
    expect(result.code).toBeNull()
    expect(result.confidence).toBe('low')
    expect(result.tariff).toBeNull()
    expect(result.rationale.join(' ')).toContain('FAIL-CLOSED')
  })

  it('returns missing rather than inventing when expansion produces no retrievable evidence', async () => {
    const ai = fakeAi([{ searchTerms: ['dispositivo misterioso'], missingFacts: ['función principal'] }])
    const result = await classifyFullNcm(index, ai, { name: 'Mystery item' })
    expect(result.status).toBe('missing')
    expect(result.code).toBeNull()
  })

  it('never exposes the whole catalog in the classification response', async () => {
    const ai = fakeAi([
      { searchTerms: ['convertidor eléctrico estático', 'fuente de alimentación'], missingFacts: [] },
      { ranking: [{ code: '8504.40.90' }], confidence: 'medium' },
    ])
    const result = await classifyFullNcm(index, ai, { name: 'power adapter' })
    expect(result.alternatives.length).toBeLessThanOrEqual(3)
    expect(JSON.stringify(result)).not.toContain('10504 records')
  })
})
