import { describe, expect, it } from 'vitest'
import { buildMarketQuery, comparableScore } from './catalogMatch'

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

  it('compacts verbose branded-model discovery queries without weakening identity checks', () => {
    const product = 'Mouse inalámbrico Logitech M170 para computadora'
    expect(buildMarketQuery(product, 'Computer mouse')).toBe('logitech m170 mouse wireless')
    expect(comparableScore(item('Mouse Inalambrico Logitech M170 USB'), product, 'Computer mouse')).toBeGreaterThanOrEqual(55)
    expect(comparableScore(item('Mouse Inalambrico Logitech M185 USB'), product, 'Computer mouse')).toBe(0)
  })

  it('keeps meaningful memory specs in compact branded queries', () => {
    expect(buildMarketQuery('Samsung Galaxy A16 128GB 4GB', 'smartphone')).toBe('samsung a16 galaxy 128gb 4gb')
  })
})
