import { describe, expect, it } from 'vitest'
import { buildFunctionalMarketQuery, functionalComparableScore } from './functionalMarketMatch'

function item(title: string, attributes: Array<{ value_name?: string }> = []) {
  return { title, price: 100000, currency_id: 'ARS', condition: 'new', attributes }
}

describe('Argentina market production-audit functional hardening', () => {
  it('requires outdoor evidence for an exterior security camera', () => {
    const target = 'Camara seguridad WiFi exterior 3MP sin marca'
    const category = 'camara de seguridad'

    expect(functionalComparableScore(item('Camara de Seguridad WiFi Interior 3MP'), target, category)).toBe(0)
    expect(functionalComparableScore(item('Camara de Seguridad WiFi 3MP'), target, category)).toBe(0)
    expect(functionalComparableScore(item('Camara de Seguridad WiFi Exterior 3MP IP66'), target, category)).toBeGreaterThanOrEqual(55)
    expect(functionalComparableScore(
      item('Camara de Seguridad WiFi 3MP IP66', [{ value_name: 'Uso exterior' }]),
      target,
      category,
    )).toBeGreaterThanOrEqual(55)
  })

  it('requires adjustable evidence for a 20kg adjustable dumbbell', () => {
    const target = 'Mancuerna ajustable 20kg sin marca'
    const category = 'mancuerna'

    expect(functionalComparableScore(item('Mancuerna Hexagonal Fija 20kg'), target, category)).toBe(0)
    expect(functionalComparableScore(item('Mancuerna Hexagonal 20kg'), target, category)).toBe(0)
    expect(functionalComparableScore(item('Mancuerna Ajustable 20kg'), target, category)).toBeGreaterThanOrEqual(55)
    expect(functionalComparableScore(
      item('Mancuerna 20kg', [{ value_name: 'Tipo regulable' }]),
      target,
      category,
    )).toBeGreaterThanOrEqual(55)
  })

  it('includes proof-required traits in functional discovery queries', () => {
    expect(buildFunctionalMarketQuery('Camara seguridad WiFi exterior 3MP sin marca', 'camara de seguridad')).toContain('outdoor')
    expect(buildFunctionalMarketQuery('Mancuerna ajustable 20kg sin marca', 'mancuerna')).toContain('adjustable')
  })
})
