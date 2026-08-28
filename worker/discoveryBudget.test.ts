import { describe, expect, it } from 'vitest'
import { applyDiscoverySearchContext, normalizeDiscoverySearchContext } from './discoveryBudget'
import type { OpportunitySearchItem } from './parsebotOpportunity'

function item(overrides: Partial<OpportunitySearchItem> = {}): OpportunitySearchItem {
  return {
    title: 'Carbon Padel Racket',
    url: 'https://www.alibaba.com/product-detail/Carbon-Padel_1600000000001.html',
    productId: '1600000000001',
    imageUrl: null,
    unitPriceUsd: 20,
    moq: 100,
    priceDisplay: 'US$20',
    supplierName: 'Supplier',
    supplierYears: '5 yrs',
    supplierBadges: [],
    reviewCount: null,
    reviewScore: null,
    packedWeightKg: null,
    volumeCbm: null,
    opportunityScore: 70,
    missingFacts: ['package_weight', 'package_volume'],
    sellingPoints: [],
    nextAction: 'analyze_product',
    source: 'parsebot_search_products',
    ...overrides,
  }
}

describe('budget-aware discovery', () => {
  it('accepts an exact MOQ × FOB budget boundary as possible', () => {
    const result = applyDiscoverySearchContext([item()], { budgetUsd: 2000 })
    expect(result.results).toHaveLength(1)
    expect(result.results[0].minimumFobUsd).toBe(2000)
    expect(result.results[0].budgetFit).toBe('possible')
    expect(result.rejectedCount).toBe(0)
  })

  it('rejects a product when MOQ × FOB alone already exceeds total budget', () => {
    const result = applyDiscoverySearchContext([item({ unitPriceUsd: 30, moq: 100 })], { budgetUsd: 2000 })
    expect(result.results).toHaveLength(0)
    expect(result.budgetRejectedCount).toBe(1)
    expect(result.rejectedCount).toBe(1)
    expect(result.contextNote).toContain('MOQ × FOB')
  })

  it('keeps products with missing price or MOQ as unknown instead of inventing feasibility', () => {
    const result = applyDiscoverySearchContext([
      item({ title: 'Missing price', unitPriceUsd: null }),
      item({ title: 'Missing MOQ', moq: null }),
    ], { budgetUsd: 5000 })
    expect(result.results).toHaveLength(2)
    expect(result.results.every((entry) => entry.budgetFit === 'unknown')).toBe(true)
    expect(result.unknownFitCount).toBe(2)
  })

  it('rejects an MOQ above the requested maximum unit range', () => {
    const result = applyDiscoverySearchContext([
      item({ title: 'MOQ 300', moq: 300 }),
      item({ title: 'MOQ 80', moq: 80 }),
    ], { unitsMin: 50, unitsMax: 200 })
    expect(result.results.map((entry) => entry.title)).toEqual(['MOQ 80'])
    expect(result.unitRangeRejectedCount).toBe(1)
  })

  it('places known possible candidates before unknown candidates without reordering ties', () => {
    const result = applyDiscoverySearchContext([
      item({ title: 'Unknown A', unitPriceUsd: null }),
      item({ title: 'Possible A', unitPriceUsd: 10, moq: 10 }),
      item({ title: 'Possible B', unitPriceUsd: 12, moq: 10 }),
      item({ title: 'Unknown B', moq: null }),
    ], { budgetUsd: 5000 })
    expect(result.results.map((entry) => entry.title)).toEqual(['Possible A', 'Possible B', 'Unknown A', 'Unknown B'])
  })

  it('leaves all candidates active when no onboarding context is supplied', () => {
    const source = [item({ title: 'A' }), item({ title: 'B', unitPriceUsd: null })]
    const result = applyDiscoverySearchContext(source, {})
    expect(result.results.map((entry) => entry.title)).toEqual(['A', 'B'])
    expect(result.results.every((entry) => entry.searchContextFit === 'not_applicable')).toBe(true)
    expect(result.contextNote).toBeNull()
  })

  it('normalizes reversed unit ranges defensively', () => {
    expect(normalizeDiscoverySearchContext({ unitsMin: 200, unitsMax: 50 })).toEqual({
      budgetUsd: null,
      unitsMin: 50,
      unitsMax: 200,
    })
  })

  it('combines budget and unit-range impossibility fail-closed', () => {
    const result = applyDiscoverySearchContext([
      item({ title: 'Too expensive', unitPriceUsd: 100, moq: 100 }),
      item({ title: 'MOQ too high', unitPriceUsd: 5, moq: 300 }),
      item({ title: 'Works', unitPriceUsd: 10, moq: 100 }),
    ], { budgetUsd: 5000, unitsMin: 50, unitsMax: 200 })
    expect(result.results.map((entry) => entry.title)).toEqual(['Works'])
    expect(result.rejectedCount).toBe(2)
  })
})
