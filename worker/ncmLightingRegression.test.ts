import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { classifyFullNcm, retrieveNcmCandidates, type NcmSearchIndex } from './ncmRetrieval'
const index = JSON.parse(readFileSync(new URL('../public/data/ncm-index.json', import.meta.url), 'utf8')) as NcmSearchIndex
const facts = { name: 'Portable Mini RGB Phone Lighting Adjustable LED Video Light', category: 'Sin clasificar', functionText: 'Iluminar fotos y videos con el celular' }
describe('reported RGB phone light with the actual 10,504-row nomenclador', () => {
  it('cannot retrieve diamonds, precious stones or recycled paper even with poisoned expansion', () => {
    const candidates = retrieveNcmCandidates(index, ['sin clasificar', 'diamantes', 'papel carton', 'piedras preciosas', 'aparatos de alumbrado led'], facts)
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every(c => /^(85|90|94)/.test(c.code))).toBe(true)
    expect(candidates.some(c => /^(47|71)/.test(c.code))).toBe(false)
  })
  it('does not retrieve a candidate from classification-status words alone', () => {
    expect(retrieveNcmCandidates(index, ['sin clasificar'], { name: 'Unclassified', category: 'Sin clasificar' })).toEqual([])
  })
  it('does not turn a weak light shortlist into a tariff on repeated attempts', async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ai = { run: async () => ({ response: JSON.stringify({ searchTerms: ['sin clasificar', 'diamantes', 'papel carton', 'aparatos de alumbrado led'], ranking: [{ code: '7102.10.00' }], confidence: 'high', missingFacts: ['Función/uso principal'] }) }) }
      const result = await classifyFullNcm(index, ai, facts)
      expect(result.code).toBeNull(); expect(result.tariff).toBeNull()
      expect(result.provisional).not.toBe(true)
      expect(result.disambiguation?.candidates.some(c => c.code.startsWith('71'))).not.toBe(true)
    }
  })
})
