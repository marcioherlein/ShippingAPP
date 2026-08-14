import { describe, expect, it } from 'vitest'
import { opportunityScore } from './scoring'

describe('opportunityScore capital handling', () => {
  it('does not award affordability points merely because capital is missing', () => {
    expect(opportunityScore(0, 0, 18, 10000, 0)).toBe(0)
  })

  it('normalizes observed economics when capital is optional so a perfect non-capital case can still reach 100', () => {
    expect(opportunityScore(0.6, 1.5, 3, 10000, 0)).toBe(100)
  })

  it('uses affordability as a real scored dimension once capital is explicitly supplied', () => {
    const insufficient = opportunityScore(0.3, 0.75, 6, 10000, 2000)
    const sufficient = opportunityScore(0.3, 0.75, 6, 10000, 10000)
    expect(sufficient).toBeGreaterThan(insufficient)
  })
})
