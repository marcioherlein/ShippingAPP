import { describe, expect, it } from 'vitest'
import { comparableScore } from './catalogMatch'

function item(title: string) {
  return { title, condition: 'new', price: 25_000, currency_id: 'ARS' }
}

describe('exact market identity with verbose intake wording', () => {
  it('does not treat post-model usage wording as a distinctive model family', () => {
    const score = comparableScore(
      item('Mouse Inalambrico Logitech M170 Negro'),
      'Mouse inalámbrico Logitech M170 para computadora',
      'Computer mouse',
    )
    expect(score).toBeGreaterThanOrEqual(55)
  })

  it('still rejects a different named family sharing the same series suffix', () => {
    const score = comparableScore(
      item('Mouse Inalambrico Logitech MX Anywhere 3S'),
      'Logitech MX Master 3S',
      'mouse inalámbrico',
    )
    expect(score).toBe(0)
  })
})
