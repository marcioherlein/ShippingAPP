import { describe, expect, it } from 'vitest'
import { evaluateOpportunitySearchSmoke } from './opportunity-smoke-policy.mjs'

const url = 'https://www.alibaba.com/product-detail/Smart-Video-Door-Phone_1601234567890.html'

function baseItem(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Smart WiFi Video Door Phone',
    url,
    unitPriceUsd: null,
    moq: null,
    supplierName: null,
    imageUrl: null,
    missingFacts: ['supplier_price', 'moq'],
    nextAction: 'analyze_product',
    source: 'alibaba_direct',
    ...overrides,
  }
}

describe('opportunity production smoke policy', () => {
  it('accepts a traceable direct Alibaba fallback even when commercial facts require opening the product', () => {
    const health = evaluateOpportunitySearchSmoke({
      status: 'live',
      mode: 'direct',
      results: [baseItem()],
    })
    expect(health.healthy).toBe(true)
    expect(health.successRate).toBe(1)
  })

  it('accepts structured Parse.bot mode only when at least one commercial fact is present', () => {
    const health = evaluateOpportunitySearchSmoke({
      status: 'live',
      mode: 'parsebot',
      results: [baseItem({ source: 'parsebot_search_products', unitPriceUsd: 19.5, missingFacts: [], nextAction: 'analyze_product' })],
    })
    expect(health.healthy).toBe(true)
  })

  it('rejects a structured result with no useful commercial evidence', () => {
    const health = evaluateOpportunitySearchSmoke({
      status: 'live',
      mode: 'parsebot',
      results: [baseItem({ source: 'parsebot_search_products' })],
    })
    expect(health.healthy).toBe(false)
    expect(health.failedChecks).toContain('provider_specific_evidence')
  })

  it('rejects fake or lookalike Alibaba URLs so a synthetic fallback cannot pass as live evidence', () => {
    const health = evaluateOpportunitySearchSmoke({
      status: 'live',
      mode: 'direct',
      results: [baseItem({ url: 'https://www.alibaba.com.evil.example/product-detail/Fake_1601.html' })],
    })
    expect(health.healthy).toBe(false)
    expect(health.failedChecks).toContain('all_results_traceable')
  })

  it('rejects provider/mode mismatch', () => {
    const health = evaluateOpportunitySearchSmoke({
      status: 'live',
      mode: 'direct',
      results: [baseItem({ source: 'parsebot_search_products' })],
    })
    expect(health.healthy).toBe(false)
    expect(health.failedChecks).toContain('source_matches_mode')
  })

  it('rejects unavailable or empty responses even if the shape is otherwise valid', () => {
    const health = evaluateOpportunitySearchSmoke({ status: 'unavailable', mode: 'unavailable', results: [] })
    expect(health.healthy).toBe(false)
    expect(health.failedChecks).toContain('status_live')
    expect(health.failedChecks).toContain('has_results')
  })
})
