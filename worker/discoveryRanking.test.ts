import { describe, expect, it } from 'vitest'
import { parseDiscoveryConstraints, rankDiscoveryResponse } from './discoveryRanking'
import type { DiscoveryResponse } from './productDiscovery'

const source = (titles: string[]): DiscoveryResponse => ({
  status: 'live', mode: 'direct', query: 'carbon padel racket', browserAttempted: false, browserMsUsed: null, note: 'live',
  results: titles.map((title, index) => ({ title, url: `https://www.alibaba.com/product-detail/P-${index}_160000000000${index}.html`, evidence: 'live' })),
})

describe('discovery constraint parsing', () => {
  it('parses explicit max price, MOQ and required origin without inventing exclusions or capital', () => {
    expect(parseDiscoveryConstraints('Buscame paletas de carbono de China, hasta USD 30, MOQ hasta 100')).toEqual({
      maxUnitPriceUsd: 30, maxMoq: 100, originCountry: 'China', excludedOriginCountries: [], lowMoqPreference: false, availableCapitalUsd: null,
    })
  })

  it('parses available capital separately from unit-price constraints', () => {
    for (const text of ['Tengo USD 10.000 para invertir', 'capital disponible USD 10000', 'dispongo de USD 10k', 'USD 10 mil de presupuesto']) {
      const constraints = parseDiscoveryConstraints(text)
      expect(constraints.availableCapitalUsd).toBe(10000)
      expect(constraints.maxUnitPriceUsd).toBeNull()
    }
  })

  it('keeps max supplier unit price distinct from user capital when both are supplied', () => {
    const constraints = parseDiscoveryConstraints('Tengo USD 10.000 de capital; buscame paletas hasta USD 30')
    expect(constraints.availableCapitalUsd).toBe(10000)
    expect(constraints.maxUnitPriceUsd).toBe(30)
  })

  it('models excluded origin separately instead of reversing the user intent', () => {
    for (const text of ['buscame paletas no China', 'cualquier origen menos China', 'padel excepto China', 'padel excluding China']) {
      const constraints = parseDiscoveryConstraints(text)
      expect(constraints.originCountry).toBeNull()
      expect(constraints.excludedOriginCountries).toContain('China')
    }
  })

  it('can retain one required origin while excluding another explicitly', () => {
    const constraints = parseDiscoveryConstraints('de Vietnam, no China, hasta USD 40')
    expect(constraints.originCountry).toBe('Vietnam')
    expect(constraints.excludedOriginCountries).toEqual(['China'])
  })

  it('handles Argentine number formatting without turning 10.000 into 10', () => {
    expect(parseDiscoveryConstraints('Quiero algo hasta USD 10.000').maxUnitPriceUsd).toBe(10000)
    expect(parseDiscoveryConstraints('Tengo USD 10.000').availableCapitalUsd).toBe(10000)
  })

  it('parses decimal prices with comma', () => {
    expect(parseDiscoveryConstraints('hasta USD 25,50').maxUnitPriceUsd).toBe(25.5)
  })

  it('recognizes low-MOQ preference but does not fabricate a numeric threshold', () => {
    const constraints = parseDiscoveryConstraints('buscame paletas con MOQ bajo')
    expect(constraints.lowMoqPreference).toBe(true)
    expect(constraints.maxMoq).toBeNull()
  })

  it('does not treat a general number as price, MOQ or capital', () => {
    expect(parseDiscoveryConstraints('necesito 3 opciones de paletas')).toEqual({
      maxUnitPriceUsd: null, maxMoq: null, originCountry: null, excludedOriginCountries: [], lowMoqPreference: false, availableCapitalUsd: null,
    })
  })
})

describe('source-backed discovery title ranking', () => {
  it('ranks visible title relevance but preserves the original source URLs', () => {
    const ranked = rankDiscoveryResponse(source(['Generic Sports Paddle', 'Professional Carbon Fiber Padel Racket 12K', 'Carbon Tennis Racket']), 'Buscame carbon padel racket')
    expect(ranked.results[0].title).toContain('Carbon Fiber Padel Racket')
    expect(ranked.results[0].titleMatch).toBe('strong')
    expect(ranked.results[0].url).toContain('alibaba.com/product-detail/')
  })

  it('keeps affordability pending until landed cost exists', () => {
    const ranked = rankDiscoveryResponse(source(['Carbon Padel Racket']), 'Tengo USD 10000 de capital, buscame carbon padel')
    expect(ranked.constraints.availableCapitalUsd).toBe(10000)
    expect(ranked.constraintsNote).toContain('affordability se evalúa con landed cost')
    expect(Object.keys(ranked.results[0])).not.toContain('affordable')
  })

  it('surfaces excluded-origin criteria as pending verification, not as title filtering', () => {
    const ranked = rankDiscoveryResponse(source(['Carbon Padel Racket China Factory']), 'carbon padel no China')
    expect(ranked.results).toHaveLength(1)
    expect(ranked.constraints.excludedOriginCountries).toEqual(['China'])
  })
})
