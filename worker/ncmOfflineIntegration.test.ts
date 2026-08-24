import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { enrichNcmSearchIndex } from '../scripts/enrich-ncm-index-from-sim.mjs'
import { classifyFullNcm, type NcmProductFacts, type NcmSearchIndex } from './ncmRetrieval'

const rawIndex = JSON.parse(readFileSync(new URL('../public/data/ncm-index.json', import.meta.url), 'utf8')) as NcmSearchIndex
const simDirectory = new URL('../public/data/sim/', import.meta.url)
const simIndexes = readdirSync(simDirectory)
  .filter((name) => /^\d{2}\.json$/.test(name))
  .sort()
  .map((name) => JSON.parse(readFileSync(new URL(name, simDirectory), 'utf8')))
const index = enrichNcmSearchIndex(rawIndex, simIndexes) as NcmSearchIndex

const offlineAi = { run: async () => { throw new Error('Workers AI unavailable') } }

const cases: Array<{ name: string; facts: NcmProductFacts; code: string }> = [
  { name: 'Carbon padel racket', facts: { name: 'Professional 12K carbon fiber padel racket', category: 'Padel racket', material: 'carbon fiber', functionText: 'sports racket for padel' }, code: '9506.59.00' },
  { name: '65W GaN USB-C charger', facts: { name: '65W GaN USB C PD fast wall charger power adapter', category: 'Power adapter', functionText: 'static power converter AC to DC' }, code: '8504.40.90' },
  { name: 'Lithium ion battery pack', facts: { name: '11.1V rechargeable 18650 lithium ion battery pack with BMS', category: 'Lithium battery', functionText: 'rechargeable electrical accumulator' }, code: '8507.60.00' },
  { name: 'Android 5G smartphone', facts: { name: 'Unlocked Android 5G smartphone dual SIM mobile phone', category: 'Smartphone', functionText: 'cellular mobile telephone' }, code: '8517.13.00' },
  { name: 'LED desk lamp', facts: { name: 'Dimmable LED desk lamp table reading light', category: 'Desk lamp', functionText: 'electric table lighting fitting' }, code: '9405.21.00' },
  { name: 'Polyester backpack', facts: { name: 'Waterproof polyester travel backpack school bag', category: 'Backpack', material: 'polyester textile' }, code: '4202.92.00' },
  { name: 'Laptop computer', facts: { name: '14 inch notebook laptop computer', category: 'Laptop computer', functionText: 'portable automatic data processing machine' }, code: '8471.30.19' },
  { name: 'USB-C cable', facts: { name: 'USB C to USB C fast charging cable with connectors', category: 'USB cable', functionText: 'insulated electric conductor fitted with connectors' }, code: '8544.42.00' },
]

describe('NCM end-to-end deterministic fallback', () => {
  for (const sample of cases) {
    it(`classifies ${sample.name} without Workers AI`, async () => {
      const result = await classifyFullNcm(index, offlineAi, sample.facts)
      expect(result.status).toBe('candidate')
      expect(result.code).toBe(sample.code)
      expect(result.confidence).toBe('medium')
      expect(result.retrievalMode).toBe('deterministic_fallback')
    })
  }

  it('keeps a desk-lamp shade replacement out of the complete lamp code', async () => {
    const result = await classifyFullNcm(index, offlineAi, {
      name: 'LED desk lamp shade replacement only',
      category: 'Lamp accessory',
      functionText: 'replacement shade only',
    })
    expect(result.code).not.toBe('9405.21.00')
    expect(result.confidence).not.toBe('high')
  })
})
