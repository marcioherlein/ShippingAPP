import { describe, expect, it } from 'vitest'
import { DEFAULT_ARGENTINA_VTEX_RETAILERS } from './vtexRetailerMarketProvider'

const STRICT_MAX = 12
const RELAXED_MAX = 30

function relaxedRetailers() {
  return DEFAULT_ARGENTINA_VTEX_RETAILERS.map((retailer) => ({
    ...retailer,
    maxCandidates: RELAXED_MAX,
  }))
}

describe('progressive retailer depth policy', () => {
  it('keeps the normal strict retailer pool bounded at 12 candidates per storefront', () => {
    expect(DEFAULT_ARGENTINA_VTEX_RETAILERS.every((retailer) => retailer.maxCandidates === STRICT_MAX)).toBe(true)
  })

  it('deepens only the relaxed category-only pool to 30 candidates per storefront', () => {
    const relaxed = relaxedRetailers()
    expect(relaxed).toHaveLength(DEFAULT_ARGENTINA_VTEX_RETAILERS.length)
    expect(relaxed.every((retailer) => retailer.maxCandidates === RELAXED_MAX)).toBe(true)
    expect(DEFAULT_ARGENTINA_VTEX_RETAILERS.every((retailer) => retailer.maxCandidates === STRICT_MAX)).toBe(true)
  })
})
