import { describe, expect, it } from 'vitest'
import { parseDiscoveryConstraints, rankDiscoveryResponse } from './discoveryRanking'
import type { DiscoveryResponse } from './productDiscovery'

const source = (titles: string[]): DiscoveryResponse => ({
  status: 'live', mode: 'direct', query: 'carbon padel racket', browserAttempted: false, browserMsUsed: null, note: 'live',
  results: titles.map((title, index) => ({ title, url: `https://www.alibaba.com/product-detail/P-${index}_160000000000${index}.html`, evidence: 'live' })),
})

describe('discovery constraint parsing', () => {
  it('parses explicit max price, MOQ and required origin without inventing exclusions', () => {
    expect(parseDiscoveryConstraints('Buscame paletas de carbono de China, hasta USD 30, MOQ hasta 100')).toEqual({
      maxUnitPriceUsd: 30, maxMoq: 100, originCountry: 'China', excludedOriginCountries: [], lowMoqPreference: false,
    })
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
    const constraints = parseDiscoveryConstraints('Quiero algo hasta USD 10.000')
    expect(constraints.maxUnitPriceUsd).toBe(10000)
  })

  it('parses decimal prices with comma', () => {
    expect(parseDiscoveryConstraints('hasta USD 25,50').maxUnitPriceUsd).toBe(25.5)
  })

  it('recognizes low-MOQ preference but does not fabricate a numeric threshold', () => {
    const constraints = parseDiscoveryConstraints('buscame paletas con MOQ bajo')
    expect(constraints.lowMoqPreference).toBe(true)
    expect(constraints.maxMoq).toBeNull()
  })

  it('does not treat a general number as price or MOQ', () => {
    expect(parseDiscoveryConstraints('necesito 3 opciones de paletas')).toEqual({
      maxUnitPriceUsd: null, maxMoq: null, originCountry: null, excludedOriginCountries: [], lowMoqPreference: false,
    })
  })
})

describe('source-backed discovery title ranking', () => {
  it('ranks visible title relevance but preserves the original source URLs', () => {
    const ranked = rankDiscoveryResponse(source([
      'Generic Sports Paddle',
      'Professional Carbon Fiber Padel Racket 12K',
      'Carbon Tennis Racket',
    ]), 'Buscame carbon padel racket')
    expect(ranked.results[0].title).toContain('Carbon Fiber Padel Racket')
    expect(ranked.results[0].titleMatch).toBe('strong')
    expect(ranked.results[0].url).toContain('alibaba.com/product-detail/')
    expect(ranked.results.every((item) => item.evidence === 'live')).toBe(true)
  })

  it('never claims that price/MOQ/origin constraints were verified by title ranking', () => {
    const ranked = rankDiscoveryResponse(source(['Carbon Padel Racket Under $20 MOQ 1 China']), 'carbon padel hasta USD 20 MOQ hasta 10 China')
    expect(ranked.constraints.maxUnitPriceUsd).toBe(20)
    expect(ranked.constraints.maxMoq).toBe(10)
    expect(ranked.constraints.originCountry).toBe('China')
    expect(ranked.constraints.excludedOriginCountries).toEqual([])
    expect(ranked.constraintsNote).toContain('pendientes de validar')
    expect(Object.keys(ranked.results[0])).not.toContain('priceVerified')
    expect(Object.keys(ranked.results[0])).not.toContain('moqVerified')
  })

  it('surfaces excluded-origin criteria as pending verification, not as title filtering', () => {
    const ranked = rankDiscoveryResponse(source(['Carbon Padel Racket China Factory']), 'carbon padel no China')
    expect(ranked.results).toHaveLength(1)
    expect(ranked.constraints.excludedOriginCountries).toEqual(['China'])
    expect(ranked.constraintsNote).toContain('origen ≠ China')
  })

  it('keeps deterministic source order when relevance is tied', () => {
    const ranked = rankDiscoveryResponse(source(['Carbon Racket A', 'Carbon Racket B']), 'carbon racket')
    expect(ranked.results.map((item) => item.title)).toEqual(['Carbon Racket A', 'Carbon Racket B'])
  })
})
