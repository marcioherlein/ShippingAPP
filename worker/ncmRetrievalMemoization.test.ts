import { describe, expect, it } from 'vitest'
import { __ncmPreparedBuildsForTests, __resetNcmPreparedCacheForTests, retrieveNcmCandidates, type NcmSearchIndex } from './ncmRetrieval'

const index: NcmSearchIndex = {
  meta: { source: 'x', sourceFile: 'x', sourceDate: '2026-08-14', parserSchema: 2, indexSchema: 3, recordCount: 3, tariffDataIncluded: false, simOpeningsIncluded: false, recordShape: '[c,l]' },
  records: [
    ['9506.59.00', 'Raquetas de tenis, bádminton o similares > Las demás paletas de pádel'],
    ['8504.40.90', 'Convertidores eléctricos estáticos fuentes de alimentación'],
    ['4202.92.00', 'Bolsos, mochilas y continentes similares de plástico o textil'],
  ],
}

describe('NCM index tokenization is memoized per index (CPU fix)', () => {
  it('tokenizes the index only once across many retrieval calls', () => {
    __resetNcmPreparedCacheForTests()
    expect(__ncmPreparedBuildsForTests()).toBe(0)

    // Simulate an iterative classify (initial + continuation attempts) on the same index.
    for (let i = 0; i < 5; i++) {
      retrieveNcmCandidates(index, ['raqueta deportiva', 'badminton similar'], { name: 'padel racket' })
    }
    // Built exactly once despite 5 calls — the expensive per-label tokenization is amortized.
    expect(__ncmPreparedBuildsForTests()).toBe(1)
  })

  it('rebuilds for a genuinely different index object', () => {
    __resetNcmPreparedCacheForTests()
    retrieveNcmCandidates(index, ['raqueta deportiva', 'badminton similar'], { name: 'padel racket' })
    const other: NcmSearchIndex = { ...index, records: [...index.records] }
    retrieveNcmCandidates(other, ['raqueta deportiva', 'badminton similar'], { name: 'padel racket' })
    expect(__ncmPreparedBuildsForTests()).toBe(2)
  })
})
