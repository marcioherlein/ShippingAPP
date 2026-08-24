import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { enrichNcmSearchIndex } from '../scripts/enrich-ncm-index-from-sim.mjs'
import { classifyFullNcm, retrieveNcmCandidates, type NcmProductFacts, type NcmSearchIndex } from './ncmRetrieval'
import { deterministicCustomsTerms } from './ncmVocabulary'

const rawIndex = JSON.parse(readFileSync(new URL('../public/data/ncm-index.json', import.meta.url), 'utf8')) as NcmSearchIndex
const simDirectory = new URL('../public/data/sim/', import.meta.url)
const simIndexes = readdirSync(simDirectory)
  .filter((name) => /^\d{2}\.json$/.test(name))
  .sort()
  .map((name) => JSON.parse(readFileSync(new URL(name, simDirectory), 'utf8')))
const index = enrichNcmSearchIndex(rawIndex, simIndexes) as NcmSearchIndex

const cases: Array<{ name: string; facts: NcmProductFacts; code: string }> = [
  { name: 'padel racket', facts: { name: 'Professional 12K carbon fiber padel racket', category: 'Padel racket', material: 'carbon fiber', functionText: 'sports racket for padel' }, code: '9506.59.00' },
  { name: 'GaN charger', facts: { name: '65W GaN USB C PD fast wall charger power adapter', category: 'Power adapter', functionText: 'static power converter AC to DC' }, code: '8504.40.90' },
  { name: 'lithium battery', facts: { name: '11.1V rechargeable 18650 lithium ion battery pack with BMS', category: 'Lithium battery', functionText: 'rechargeable electrical accumulator' }, code: '8507.60.00' },
  { name: 'smartphone', facts: { name: 'Unlocked Android 5G smartphone dual SIM mobile phone', category: 'Smartphone', functionText: 'cellular mobile telephone' }, code: '8517.13.00' },
  { name: 'desk lamp', facts: { name: 'Dimmable LED desk lamp table reading light', category: 'Desk lamp', functionText: 'electric table lighting fitting' }, code: '9405.21.00' },
  { name: 'polyester backpack', facts: { name: 'Waterproof polyester travel backpack school bag', category: 'Backpack', material: 'polyester textile' }, code: '4202.92.00' },
  { name: 'laptop', facts: { name: '14 inch notebook laptop computer', category: 'Laptop computer', functionText: 'portable automatic data processing machine' }, code: '8471.30.19' },
  { name: 'USB-C cable with connectors', facts: { name: 'USB C to USB C fast charging cable with connectors', category: 'USB cable', functionText: 'insulated electric conductor fitted with connectors' }, code: '8544.42.00' },
]

const offlineAi = {
  run: async () => { throw new Error('Workers AI unavailable in deterministic regression') },
}

describe('deterministic bilingual NCM retrieval', () => {
  it('uses the same SIM-enriched search index that is deployed by postbuild', () => {
    expect(rawIndex.records.find(([code]) => code === '8517.13.00')?.[1]).toBe('')
    expect(index.records.find(([code]) => code === '8517.13.00')?.[1]).toContain('Telefonos inteligentes')
    expect(rawIndex.records.find(([code]) => code === '9405.21.00')?.[1]).toBe('')
    expect(index.records.find(([code]) => code === '9405.21.00')?.[1].length).toBeGreaterThan(40)
  })

  for (const sample of cases) {
    it(`puts the correct ARCA code in the shortlist for ${sample.name}`, () => {
      const terms = deterministicCustomsTerms(sample.facts)
      const shortlist = retrieveNcmCandidates(index, terms, sample.facts, 25)
      expect(terms.length).toBeGreaterThan(0)
      expect(shortlist.length).toBeGreaterThan(0)
      expect(shortlist.map((item) => item.code)).toContain(sample.code)
    })

    it(`selects ${sample.code} without Workers AI for ${sample.name}`, async () => {
      const result = await classifyFullNcm(index, offlineAi, sample.facts)
      expect(result.status).toBe('candidate')
      expect(result.code).toBe(sample.code)
      expect(['medium', 'high']).toContain(result.confidence)
      expect(result.retrievalMode).toBe('deterministic_fallback')
    })
  }

  it('does not create customs codes in deterministic vocabulary', () => {
    const terms = deterministicCustomsTerms({ name: 'USB C charging cable with connectors' })
    expect(terms.some((term) => /\b\d{4}[.]?\d{2}[.]?\d{2}\b/.test(term))).toBe(false)
  })

  it('does not turn a lamp shade replacement into the complete lamp shortlist', () => {
    const facts = { name: 'LED desk lamp shade replacement only', category: 'Lamp accessory', functionText: 'replacement shade only' }
    const shortlist = retrieveNcmCandidates(index, deterministicCustomsTerms(facts), facts, 25)
    expect(shortlist.map((item) => item.code)).not.toContain('9405.21.00')
  })
})
