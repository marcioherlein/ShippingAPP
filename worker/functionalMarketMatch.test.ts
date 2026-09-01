import { describe, expect, it } from 'vitest'
import {
  buildFunctionalMarketQuery,
  functionalComparableScore,
  inferArgentinaMarketMatchMode,
} from './functionalMarketMatch'

function item(title: string, price = 100000, condition = 'new', attributes: Array<{ id?: string; value_name?: string }> = []) {
  return { title, price, currency_id: 'ARS', condition, attributes }
}

describe('Argentina market functional comparable matcher', () => {
  it('keeps branded/model-specific products in exact mode', () => {
    expect(inferArgentinaMarketMatchMode('Apple iPhone 16 128GB', 'celular')).toBe('exact')
    expect(inferArgentinaMarketMatchMode('Philco PHS32HA4CN 3400W', 'aire acondicionado')).toBe('exact')
    expect(inferArgentinaMarketMatchMode('Samsung WW65A4000EE 6.5kg', 'lavarropas')).toBe('exact')
  })

  it('routes private-label and generic products to functional mode, including decimal and domain specs', () => {
    expect(inferArgentinaMarketMatchMode('IANONI Super Power Carbon Fiber Padel Racket', 'paleta de padel')).toBe('functional')
    expect(inferArgentinaMarketMatchMode('Generic Cordless Vacuum 500W', 'aspiradora')).toBe('functional')
    expect(inferArgentinaMarketMatchMode('Caja organizadora plastica transparente 60L', 'storage box')).toBe('functional')
    expect(inferArgentinaMarketMatchMode('Pava electrica 1.7L 2200W sin marca', 'pava electrica')).toBe('functional')
    expect(inferArgentinaMarketMatchMode('Lavarropas frontal 6.5kg sin marca', 'lavarropas')).toBe('functional')
    expect(inferArgentinaMarketMatchMode('Cafetera espresso 15 bar sin marca', 'cafetera espresso')).toBe('functional')
    expect(inferArgentinaMarketMatchMode('Camara seguridad WiFi exterior 3MP sin marca', 'camara de seguridad')).toBe('functional')
  })

  it('accepts equivalent branded products only when category and explicit specs match', () => {
    expect(functionalComparableScore(
      item('Aspiradora Inalambrica Electrolux 500W'),
      'Generic Cordless Vacuum 500W',
      'aspiradora',
    )).toBeGreaterThanOrEqual(55)
    expect(functionalComparableScore(
      item('Aspiradora Inalambrica Electrolux'),
      'Generic Cordless Vacuum 500W',
      'aspiradora',
    )).toBe(0)
  })

  it('rejects wrong explicit specifications even when category matches', () => {
    expect(functionalComparableScore(
      item('Aspiradora Inalambrica Electrolux 700W'),
      'Generic Cordless Vacuum 500W',
      'aspiradora',
    )).toBe(0)
    expect(functionalComparableScore(
      item('Pava Electrica 1,7L 2000W'),
      'Pava electrica 1.7L 2200W sin marca',
      'pava electrica',
    )).toBe(0)
    expect(functionalComparableScore(
      item('Amoladora Lusqtoff Angular 115mm 850W', 100000, 'new', [{ id: 'POWER', value_name: '800W' }]),
      'Amoladora angular 115mm 800W sin marca',
      'amoladora',
    )).toBe(0)
  })

  it('preserves decimal specs instead of truncating 1.7L to 7L or 6.5kg to 5kg', () => {
    const kettle = buildFunctionalMarketQuery('Pava electrica 1.7L 2200W sin marca', 'pava electrica')
    const washer = buildFunctionalMarketQuery('Lavarropas frontal 6.5kg sin marca', 'lavarropas')
    expect(kettle).toContain('1.7l')
    expect(kettle).not.toMatch(/(?:^|\s)7l(?:\s|$)/)
    expect(washer).toContain('6.5kg')
    expect(washer).not.toMatch(/(?:^|\s)5kg(?:\s|$)/)
  })

  it('parses quote-style screen/fan sizes and rejects 18-inch vs 20-inch and 43-inch vs 55-inch', () => {
    expect(functionalComparableScore(
      item('Ventilador de Pie 18\" 100W'),
      'Ventilador 20 pulgadas 100W sin marca',
      'ventilador',
    )).toBe(0)
    expect(functionalComparableScore(
      item('Smart TV TCL 43\" 4K'),
      'Smart TV 55 pulgadas 4K sin marca',
      'smart tv',
    )).toBe(0)
    expect(functionalComparableScore(
      item('Smart TV TCL 55\" 4K'),
      'Smart TV 55 pulgadas 4K sin marca',
      'smart tv',
    )).toBeGreaterThanOrEqual(55)
  })

  it('rejects 5kg washers and non-frontal washers against a 6.5kg frontal target', () => {
    expect(functionalComparableScore(
      item('Lavarropas Philco 5kg 700RPM'),
      'Lavarropas frontal 6.5kg sin marca',
      'lavarropas',
    )).toBe(0)
    expect(functionalComparableScore(
      item('Lavarropas Carga Superior 6,5kg 700RPM'),
      'Lavarropas frontal 6.5kg sin marca',
      'lavarropas',
    )).toBe(0)
    expect(functionalComparableScore(
      item('Lavarropas Frontal 6,5kg 1000RPM'),
      'Lavarropas frontal 6.5kg sin marca',
      'lavarropas',
    )).toBeGreaterThanOrEqual(55)
  })

  it('requires proof of carbon when carbon is an explicit functional constraint', () => {
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
    expect(functionalComparableScore(
      item('Paleta Padel Vairo Terra Profesional'),
      'IANONI Super Power Carbon Fiber Padel Racket',
      'paleta de padel',
    )).toBe(0)
  })

  it('requires ANC when it is explicitly requested', () => {
    expect(functionalComparableScore(
      item('Auriculares TWS Bluetooth F9'),
      'Auriculares TWS Bluetooth con ANC sin marca',
      'auriculares bluetooth',
    )).toBe(0)
    expect(functionalComparableScore(
      item('Auriculares TWS Bluetooth Noise Cancelling ANC'),
      'Auriculares TWS Bluetooth con ANC sin marca',
      'auriculares bluetooth',
    )).toBeGreaterThanOrEqual(55)
  })

  it('keeps bagless targets separate from bagged vacuums', () => {
    expect(functionalComparableScore(
      item('Aspiradora Smartlife con bolsa 1800W'),
      'Aspiradora sin bolsa 1800W sin marca',
      'aspiradora',
    )).toBe(0)
    expect(functionalComparableScore(
      item('Aspiradora Smartlife sin bolsa 1800W'),
      'Aspiradora sin bolsa 1800W sin marca',
      'aspiradora',
    )).toBeGreaterThanOrEqual(55)
  })

  it('requires explicit slot-count evidence when a toaster specifies two slots', () => {
    expect(functionalComparableScore(item('Tostadora 800W'), 'Tostadora 2 ranuras 800W sin marca', 'tostadora')).toBe(0)
    expect(functionalComparableScore(item('Tostadora 2 rodajas 800W'), 'Tostadora 2 ranuras 800W sin marca', 'tostadora')).toBeGreaterThanOrEqual(55)
    expect(functionalComparableScore(item('Tostadora 4 ranuras 800W'), 'Tostadora 2 ranuras 800W sin marca', 'tostadora')).toBe(0)
  })

  it('requires all category evidence for multi-token functional categories', () => {
    expect(functionalComparableScore(
      item('TV LED 55\" 4K'),
      'Smart TV 55 pulgadas 4K sin marca',
      'smart tv',
    )).toBe(0)
    expect(functionalComparableScore(
      item('Smart TV LED 55\" 4K'),
      'Smart TV 55 pulgadas 4K sin marca',
      'smart tv',
    )).toBeGreaterThanOrEqual(55)
  })

  it('rejects accessories, unsolicited bundles, sets and used items', () => {
    expect(functionalComparableScore(item('Filtro Repuesto Aspiradora Inalambrica 500W'), 'Generic Cordless Vacuum 500W', 'aspiradora')).toBe(0)
    expect(functionalComparableScore(item('Combo Aspiradora Inalambrica 500W + Accesorios'), 'Generic Cordless Vacuum 500W', 'aspiradora')).toBe(0)
    expect(functionalComparableScore(item('Set Planchita de Ceramica y Secador de Pelo 2200W'), 'Secador de pelo 2200W sin marca', 'secador de pelo')).toBe(0)
    expect(functionalComparableScore(item('Aspiradora Inalambrica 500W', 100000, 'used'), 'Generic Cordless Vacuum 500W', 'aspiradora')).toBe(0)
  })

  it('rejects electric-vs-gas, missing electric proof and pack-size conflicts', () => {
    expect(functionalComparableScore(item('Termotanque a Gas 80 Litros'), 'Termotanque electrico 80 litros sin marca', 'termotanque')).toBe(0)
    expect(functionalComparableScore(item('Termotanque 80 Litros'), 'Termotanque electrico 80 litros sin marca', 'termotanque')).toBe(0)
    expect(functionalComparableScore(item('Termotanque Electrico 80 Litros'), 'Termotanque electrico 80 litros sin marca', 'termotanque')).toBeGreaterThanOrEqual(55)
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
