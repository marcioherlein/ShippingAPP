import { describe, expect, it } from 'vitest'
import { comparableScore } from './catalogMatch'

const target = 'IANONI Super Power Carbon Fiber Padel Racket'
const category = 'Padel racket'

function item(title: string, condition = 'new') {
  return { title, condition, price: 200000, currency_id: 'ARS' }
}

describe('market comparable adversarial rules', () => {
  it('rejects accessories that mention padel and carbon', () => {
    expect(comparableScore(item('Protector Para Paleta De Padel Simil Carbono'), target, category)).toBe(0)
  })

  it('does not price an unknown brand from a premium local brand', () => {
    expect(comparableScore(item('Paleta Padel Bullpadel Neuron Carbon 3K'), target, category)).toBe(0)
  })

  it('accepts a generic new carbon padel racket', () => {
    expect(comparableScore(item('Paleta Padel Carbono 3K Profesional'), target, category)).toBeGreaterThanOrEqual(65)
  })

  it('rejects used listings', () => {
    expect(comparableScore(item('Paleta Padel Carbono 3K', 'used'), target, category)).toBe(0)
  })

  it('keeps uncertain material below the accepted threshold', () => {
    expect(comparableScore(item('Paleta Padel Fibra De Vidrio'), target, category)).toBeLessThan(55)
  })

  it('keeps exact product families separate even when generation matches', () => {
    expect(comparableScore(
      item('Mouse Inalambrico Logitech MX Master 3S 8000dpi Bluetooth'),
      'Logitech MX Master 3S',
      'mouse inalámbrico',
    )).toBeGreaterThanOrEqual(55)
    expect(comparableScore(
      item('Logitech MX Anywhere 3S Ratón inalámbrico'),
      'Logitech MX Master 3S',
      'mouse inalámbrico',
    )).toBe(0)
  })

  it('does not treat descriptive intake wording as an exact model family', () => {
    expect(comparableScore(
      item('Mouse Inalambrico Logitech M170'),
      'Mouse inalámbrico Logitech M170 para computadora',
      'Computer mouse',
    )).toBeGreaterThanOrEqual(55)
  })
})
