import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { commonOfficialHierarchy, enrichNcmSearchIndex } from './enrich-ncm-index-from-sim.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
}

function row(index, code) {
  return index.records.find((item) => Array.isArray(item) && item[0] === code)
}

describe('official SIM enrichment for NCM search index', () => {
  it('uses only hierarchy shared by exact-code SIM openings', () => {
    expect(commonOfficialHierarchy([
      'ROOT > Branch > Exact NCM > SIM option A',
      'ROOT > Branch > Exact NCM > SIM option B',
    ])).toBe('ROOT > Branch > Exact NCM')
  })

  it('restores real blank smartphone and LED desk-lamp NCM labels from official SIM files', () => {
    const base = readJson('public/data/ncm-index.json')
    const sim85 = readJson('public/data/sim/85.json')
    const sim94 = readJson('public/data/sim/94.json')

    expect(row(base, '8517.13.00')?.[1]).toBe('')
    expect(row(base, '9405.21.00')?.[1]).toBe('')

    const enriched = enrichNcmSearchIndex(base, [sim85, sim94])
    const smartphone = row(enriched, '8517.13.00')?.[1] || ''
    const deskLamp = row(enriched, '9405.21.00')?.[1] || ''

    expect(smartphone.length).toBeGreaterThan(40)
    expect(smartphone.toLowerCase()).toContain('telefonos inteligentes')
    expect(deskLamp.length).toBeGreaterThan(40)
    expect(deskLamp.toLowerCase()).toContain('led')
    expect(enriched.meta.simEnrichedLabelCount).toBeGreaterThan(0)
    expect(enriched.meta.remainingBlankLabelCount).toBeLessThan(enriched.meta.originalBlankLabelCount)
  })

  it('never creates an NCM code that is absent from the canonical base index', () => {
    const base = {
      meta: { indexSchema: 3, tariffDataIncluded: false, simOpeningsIncluded: false },
      records: [['1111.11.11', '']],
    }
    const sim = {
      records: [
        ['1111.11.11', '', [['1111.11.11.000A', 'ROOT > Canonical leaf']]],
        ['9999.99.99', '', [['9999.99.99.000Z', 'SHOULD NEVER BECOME A NEW NCM']]],
      ],
    }

    const enriched = enrichNcmSearchIndex(base, [sim])
    expect(enriched.records).toEqual([['1111.11.11', 'ROOT > Canonical leaf']])
    expect(enriched.records.some(([code]) => code === '9999.99.99')).toBe(false)
  })
})
