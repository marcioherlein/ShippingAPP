import { describe, expect, it } from 'vitest'
import { classifyFullNcm, type NcmSearchIndex } from './ncmRetrieval'

// Two tennis-racket positions carry tariffs; 9506.51.00 has the HIGHER import duty (35 vs 20).
// The conservative provisional estimate must pick the highest-duty candidate from the shortlist.
const index: NcmSearchIndex = {
  meta: {
    source: 'ARCA Arancel Integrado', sourceFile: 'nomenclador_14082026.txt', sourceDate: '2026-08-14',
    parserSchema: 2, indexSchema: 3, recordCount: 10504, tariffDataIncluded: false,
    simOpeningsIncluded: false, recordShape: '[ncmCode,label]',
  },
  records: [
    ['9506.59.00', 'Raquetas de tenis, bádminton o similares, incluso sin cordaje > Las demás', 20, 20, 3, 0, 21, 20, 6, 2.5, null, false],
    ['9506.51.00', 'Raquetas de tenis, incluso sin cordaje', 35, 35, 3, 0, 21, 20, 6, 2.5, null, false],
    ['9506.40.00', 'Artículos y material para tenis de mesa'],
  ],
}

function fakeAi(outputs: unknown[]) {
  let i = 0
  return { run: async () => ({ response: JSON.stringify(outputs[i++] ?? {}) }) }
}

describe('full NCM LOW branch — conservative provisional estimate', () => {
  it('keeps fail-closed fields null/low while emitting the highest-duty provisional', async () => {
    const ai = fakeAi([
      { searchTerms: ['raqueta tenis deportiva', 'raqueta similar bádminton'], missingFacts: [] },
      { ranking: [{ code: '9506.51.00', reason: 'AI prefers tennis' }, { code: '9506.59.00' }], confidence: 'high' },
    ])
    const result = await classifyFullNcm(index, ai, { name: 'ambiguous racket', category: 'racket sport' })

    // Fail-closed invariant unchanged.
    expect(result.status).toBe('missing')
    expect(result.code).toBeNull()
    expect(result.confidence).toBe('low')
    expect(result.tariff).toBeNull()
    expect(result.rationale.join(' ')).toContain('FAIL-CLOSED')

    // Best-effort provisional: highest diePct among the shortlisted candidates.
    expect(result.provisional).toBe(true)
    expect(result.provisionalTariff?.diePct).toBe(35)
    expect(result.provisionalCode).toBe('9506.51.00')
    expect(result.provisionalBasis).toContain('35%')
    expect(result.provisionalBasis).toContain('verificá')
  })

  it('surfaces plain-Spanish disambiguation candidates without exposing them as confirmed', async () => {
    const ai = fakeAi([
      { searchTerms: ['raqueta tenis deportiva', 'raqueta similar bádminton'], missingFacts: [] },
      { ranking: [{ code: '9506.51.00' }, { code: '9506.59.00' }], confidence: 'high' },
    ])
    const result = await classifyFullNcm(index, ai, { name: 'ambiguous racket', category: 'racket sport' })
    expect(result.disambiguation).not.toBeNull()
    expect((result.disambiguation?.candidates.length ?? 0)).toBeGreaterThan(0)
    // Candidates expose a plainLabel (never only the bare code).
    expect(result.disambiguation?.candidates.every((c) => typeof c.plainLabel === 'string' && c.plainLabel.length > 0)).toBe(true)
  })
})
