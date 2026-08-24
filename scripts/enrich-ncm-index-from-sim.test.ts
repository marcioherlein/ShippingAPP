import { describe, expect, it } from 'vitest'
import { enrichNcmSearchIndex, officialSimSearchEvidence } from './enrich-ncm-index-from-sim.mjs'

describe('NCM search-text enrichment from official SIM data', () => {
  it('preserves the canonical ARCA label and appends bounded terminal SIM descriptors', () => {
    const base = {
      meta: { recordCount: 1, tariffDataIncluded: false, simOpeningsIncluded: false },
      records: [['4202.92.00', 'BAULES, MALETAS Y CONTINENTES SIMILARES > Los demás']],
    }
    const sim = [{ records: [[
      '4202.92.00',
      'BAULES, MALETAS Y CONTINENTES SIMILARES > Los demás',
      [
        ['4202.92.00.100A', 'BAULES, MALETAS Y CONTINENTES SIMILARES > Los demás > Mochilas'],
        ['4202.92.00.200B', 'BAULES, MALETAS Y CONTINENTES SIMILARES > Los demás > Bolsos de viaje'],
      ],
    ]]] }]

    const enriched = enrichNcmSearchIndex(base, sim)
    const label = enriched.records[0][1]
    expect(label.startsWith(base.records[0][1])).toBe(true)
    expect(label).toContain('Mochilas')
    expect(label).toContain('Bolsos de viaje')
    expect(label).not.toContain('4202.92.00.100A')
    expect(enriched.meta.searchTextEnrichment).toBe('official-sim-terminal-vocabulary')
  })

  it('deduplicates generic/base hierarchy and keeps only useful terminal evidence', () => {
    const evidence = officialSimSearchEvidence([
      'Computadoras > Portátiles > Las demás',
      'Computadoras > Portátiles > Las demás',
      'Computadoras > Portátiles > Notebooks',
    ], 'Computadoras > Portátiles')
    expect(evidence).toEqual(['Notebooks'])
  })

  it('never creates NCM records that were absent from the canonical base index', () => {
    const base = { meta: {}, records: [['1111.11.11', 'Producto base']] }
    const sim = [{ records: [['2222.22.22', 'Otro producto', [['2222.22.22.001A', 'Otro producto > Variante']]]] }]
    const enriched = enrichNcmSearchIndex(base, sim)
    expect(enriched.records).toEqual([['1111.11.11', 'Producto base']])
  })
})
