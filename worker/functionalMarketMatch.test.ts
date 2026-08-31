import { describe, expect, it } from 'vitest'
import {
  buildFunctionalMarketQuery,
  functionalComparableScore,
  inferArgentinaMarketMatchMode,
} from './functionalMarketMatch'

function item(title: string, price = 100000, condition = 'new') {
  return { title, price, currency_id: 'ARS', condition }
}

describe('Argentina market functional comparable matcher', () => {
  it('keeps branded/model-specific products in exact mode', () => {
    expect(inferArgentinaMarketMatchMode('Apple iPhone 16 128GB', 'celular')).toBe('exact')
    expect(inferArgentinaMarketMatchMode('Philco PHS32HA4CN 3400W', 'aire acondicionado')).toBe('exact')
    expect(inferArgentinaMarketMatchMode('Samsung WW65A4000EE 6.5kg', 'lavarropas')).toBe('exact')
  })

  it('routes private-label and generic products to functional mode', () => {
    expect(inferArgentinaMarketMatchMode('IANONI Super Power Carbon Fiber Padel Racket', 'paleta de padel')).toBe('functional')
    expect(inferArgentinaMarketMatchMode('Generic Cordless Vacuum 500W', 'aspiradora')).toBe('functional')
    expect(inferArgentinaMarketMatchMode('Caja organizadora plastica transparente 60L', 'storage box')).toBe('functional')
  })

  it('accepts equivalent branded products when category and critical specs match', () => {
    expect(functionalComparableScore(
      item('Aspiradora Inalambrica Electrolux 500W'),
      'Generic Cordless Vacuum 500W',
      'aspiradora',
    )).toBeGreaterThanOrEqual(55)
  })

  it('rejects a wrong explicit specification even when category matches', () => {
    expect(functionalComparableScore(
      item('Aspiradora Inalambrica Electrolux 700W'),
      'Generic Cordless Vacuum 500W',
      'aspiradora',
    )).toBe(0)
  })

  it('accepts a carbon padel equivalent but rejects fiberglass against carbon', () => {
    expect(functionalComparableScore(
      item('Paleta Padel Carbono 3K EVA Profesional'),
      'IANONI Super Power Carbon Fiber Padel Racket',
      'paleta de padel',
    )).toBeGreaterThanOrEqual(55)
    expect(functionalComparableScore(
      item('Paleta Padel Fibra de Vidrio EVA Profesional'),
      'IANONI Super Power Carbon Fiber Padel Racket',
      'paleta de padel',
    )).toBe(0)
  })

  it('rejects accessories, unsolicited bundles and used items', () => {
    expect(functionalComparableScore(item('Filtro Repuesto Aspiradora Inalambrica 500W'), 'Generic Cordless Vacuum 500W', 'aspiradora')).toBe(0)
    expect(functionalComparableScore(item('Combo Aspiradora Inalambrica 500W + Accesorios'), 'Generic Cordless Vacuum 500W', 'aspiradora')).toBe(0)
    expect(functionalComparableScore(item('Aspiradora Inalambrica 500W', 100000, 'used'), 'Generic Cordless Vacuum 500W', 'aspiradora')).toBe(0)
  })

  it('rejects electric-vs-gas and pack-size conflicts', () => {
    expect(functionalComparableScore(item('Termotanque a Gas 80 Litros'), 'Termotanque electrico 80 litros sin marca', 'termotanque')).toBe(0)
    expect(functionalComparableScore(item('Pack x6 Lampara LED E27 9W'), 'Lampara LED E27 Pack 10 unidades', 'lampara')).toBe(0)
  })

  it('builds functional discovery queries from category/spec evidence, not private-label branding', () => {
    const query = buildFunctionalMarketQuery('IANONI Super Power Carbon Fiber Padel Racket', 'paleta de padel')
    expect(query).toContain('racket')
    expect(query).toContain('padel')
    expect(query).toContain('carbon')
    expect(query).not.toContain('ianoni')
  })
})
