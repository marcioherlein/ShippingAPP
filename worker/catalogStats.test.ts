import { describe, expect, it } from 'vitest'
import { percentile, trimPriceOutliers } from './catalogStats'

describe('market price robustness', () => {
  it('removes an extreme high-price outlier from a stable OEM cluster', () => {
    const prices = [180000, 190000, 195000, 205000, 215000, 225000, 230000, 900000]
    const trimmed = trimPriceOutliers(prices, (value) => value, 5)
    expect(trimmed).not.toContain(900000)
    expect(percentile(trimmed, 0.4)).toBeLessThan(220000)
  })

  it('does not trim when too few observations would remain', () => {
    const prices = [180000, 190000, 900000]
    expect(trimPriceOutliers(prices, (value) => value, 5)).toEqual(prices)
  })
})
