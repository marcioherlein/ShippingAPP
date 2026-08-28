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
    ['9506.59.00', 'Raquetas de tenis, bádminton o similares, incluso sin cordaje > Las demás'],
    ['9506.40.00', 'Artículos y material para tenis de mesa'],
    ['9506.51.00', 'Raquetas de tenis, incluso sin cordaje'],
    ['8504.40.90', 'Transformadores eléctricos, convertidores eléctricos estáticos y bobinas de reactancia > Convertidores estáticos > Los demás'],
    ['8507.60.00', 'Acumuladores eléctricos > De iones de litio'],
    ['8517.13.00', 'Teléfonos inteligentes'],
    ['4202.92.00', 'Bolsos, mochilas y continentes similares > Con superficie exterior de hojas de plástico o materia textil'],
    ['8544.42.00', 'Conductores eléctricos aislados provistos de piezas de conexión'],
  ],
}

function fakeAi(outputs: unknown[]) {
  let i = 0
  return { run: async () => ({ response: JSON.stringify(outputs[i++] ?? {}) }) }
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

  it('canonicalizes ordinary plural forms without breaking smartphones or inteligentes', () => {
    expect(canonicalToken('raquetas')).toBe('raqueta')
    expect(canonicalToken('similares')).toBe('similar')
    expect(canonicalToken('convertidores')).toBe('convertidor')
    expect(canonicalToken('tenis')).toBe('tenis')
    expect(canonicalToken('smartphones')).toBe('smartphone')
    expect(canonicalToken('inteligentes')).toBe('inteligente')
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

  it('resolves an obvious English smartphone without AI', async () => {
    const ai = { run: async () => { throw new Error('offline') } }
    const result = await classifyFullNcm(index, ai, { name: 'Unlocked Android 5G Smartphone Dual SIM Mobile Phone' })
    expect(result.status).toBe('candidate')
    expect(result.code).toBe('8517.13.00')
    expect(result.retrievalMode).toBe('deterministic_fallback')
  })

  it('keeps a cable-without-adapter out of the charger classification', async () => {
    const ai = { run: async () => { throw new Error('offline') } }
    const result = await classifyFullNcm(index, ai, { name: 'USB C Charging Cable 2m No Power Adapter' })
    expect(result.code).toBe('8544.42.00')
    expect(result.code).not.toBe('8504.40.90')
  })
})

describe('full NCM AI-constrained classification', () => {
  it('classifies a generic static-converter module using AI vocabulary but only an official shortlist code', async () => {
    const ai = fakeAi([
      { searchTerms: ['convertidor eléctrico estático', 'fuente de alimentación eléctrica'], missingFacts: [] },
      { ranking: [{ code: '8504.40.90', reason: 'La función principal es conversión estática de energía.' }], confidence: 'high', missingFacts: ['confirmar tensión y tipo de conversión'] },
    ])
    const result = await classifyFullNcm(index, ai, { name: 'AC DC electronic conversion module', category: 'Power electronics module' })
    expect(result.code).toBe('8504.40.90')
    expect(result.status).toBe('candidate')
    expect(result.sourceDate).toBe('2026-08-14')
    expect(result.catalogRecordCount).toBe(10504)
    expect(result.missingFacts).toContain('confirmar tensión y tipo de conversión')
  })

  it('ignores a hallucinated AI winner and falls back within the deterministic shortlist', async () => {
    const ai = fakeAi([
      { searchTerms: ['raqueta deportiva', 'bádminton similar'], missingFacts: [] },
      { ranking: [{ code: '1234.56.78', reason: 'hallucinated' }], confidence: 'high' },
    ])
    const result = await classifyFullNcm(index, ai, { name: 'generic carbon sports racket', category: 'racket sport' })
    expect(result.code).toBe('9506.59.00')
    expect(result.retrievalMode).toBe('deterministic_fallback')
    expect(result.confidence).toBe('low')
  })

  it('caps confidence at low when AI and deterministic retrieval disagree', async () => {
    const ai = fakeAi([
      { searchTerms: ['raqueta tenis deportiva', 'raqueta similar bádminton'], missingFacts: [] },
      { ranking: [{ code: '9506.51.00', reason: 'AI prefers tennis' }, { code: '9506.59.00' }], confidence: 'high' },
    ])
    const result = await classifyFullNcm(index, ai, { name: 'ambiguous racket', category: 'racket sport' })
    if (result.retrievalMode === 'ai_reranked') expect(result.confidence).toBe('low')
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
    const result = await classifyFullNcm(index, ai, { name: 'power conversion device' })
    expect(result.alternatives.length).toBeLessThanOrEqual(3)
    expect(JSON.stringify(result)).not.toContain('10504 records')
  })
})
