import { describe, expect, it } from 'vitest'
import { buildMarketQuery, comparableScore } from './catalogMatch'

function item(title: string, condition = 'new') {
  return { title, condition, price: 200000, currency_id: 'ARS' }
}

type Fixture = {
  name: string
  target: string
  category: string
  candidate: string
  expected: 'accept' | 'reject'
  severity?: 'high' | 'normal'
  condition?: string
}

const fixtures: Fixture[] = [
  {
    name: 'same iPhone model and storage with reordered title',
    target: 'Apple iPhone 15 128GB', category: 'Smartphone',
    candidate: 'Celular Apple iPhone 15 128 GB', expected: 'accept',
  },
  {
    name: 'reject iPhone Pro variant when target is base model',
    target: 'Apple iPhone 15 128GB', category: 'Smartphone',
    candidate: 'Apple iPhone 15 Pro 128GB', expected: 'reject', severity: 'high',
  },
  {
    name: 'reject wrong iPhone storage',
    target: 'Apple iPhone 15 128GB', category: 'Smartphone',
    candidate: 'Apple iPhone 15 256GB', expected: 'reject', severity: 'high',
  },
  {
    name: 'reject wrong iPhone generation',
    target: 'Apple iPhone 15 128GB', category: 'Smartphone',
    candidate: 'Apple iPhone 14 128GB', expected: 'reject', severity: 'high',
  },
  {
    name: 'same Bosch drill model and wattage',
    target: 'Bosch GSB 13 RE 650W', category: 'Drill',
    candidate: 'Taladro Bosch GSB 13 RE 650W Percutor', expected: 'accept',
  },
  {
    name: 'reject Bosch drill with different wattage',
    target: 'Bosch GSB 13 RE 650W', category: 'Drill',
    candidate: 'Taladro Bosch GSB 13 RE 750W Percutor', expected: 'reject', severity: 'high',
  },
  {
    name: 'reject Bosch drill with different model number',
    target: 'Bosch GSB 13 RE 650W', category: 'Drill',
    candidate: 'Taladro Bosch GSB 16 RE 650W Percutor', expected: 'reject', severity: 'high',
  },
  {
    name: 'same Xiaomi robot vacuum model and suction',
    target: 'Xiaomi Robot Vacuum S10 4000Pa', category: 'Vacuum',
    candidate: 'Aspiradora Robot Xiaomi S10 4000 Pa', expected: 'accept',
  },
  {
    name: 'reject replacement filter as robot vacuum',
    target: 'Xiaomi Robot Vacuum S10 4000Pa', category: 'Vacuum',
    candidate: 'Filtro Repuesto Para Aspiradora Robot Xiaomi S10', expected: 'reject', severity: 'high',
  },
  {
    name: 'same Logitech headset model',
    target: 'Logitech G435 Wireless Headphones', category: 'Headphones',
    candidate: 'Auriculares Inalambricos Logitech G435', expected: 'accept',
  },
  {
    name: 'reject different Logitech headset model',
    target: 'Logitech G435 Wireless Headphones', category: 'Headphones',
    candidate: 'Auriculares Inalambricos Logitech G733', expected: 'reject', severity: 'high',
  },
  {
    name: 'same Philips blender model and power',
    target: 'Philips Blender HR2291 600W', category: 'Blender',
    candidate: 'Licuadora Philips HR2291 600 W', expected: 'accept',
  },
  {
    name: 'reject Philips blender with different power',
    target: 'Philips Blender HR2291 600W', category: 'Blender',
    candidate: 'Licuadora Philips HR2291 800 W', expected: 'reject', severity: 'high',
  },
  {
    name: 'same 60 liter storage box',
    target: 'Caja organizadora plastica transparente 60L', category: 'Storage box',
    candidate: 'Caja Organizadora Transparente Plastica 60 Litros', expected: 'accept',
  },
  {
    name: 'reject different storage-box capacity',
    target: 'Caja organizadora plastica transparente 60L', category: 'Storage box',
    candidate: 'Caja Organizadora Transparente Plastica 45 Litros', expected: 'reject', severity: 'high',
  },
  {
    name: 'same ten-unit lamp pack',
    target: 'Lampara LED E27 Pack 10 unidades', category: 'Lampara',
    candidate: 'Pack X10 Lampara Led E27', expected: 'accept',
  },
  {
    name: 'reject six-unit pack against ten-unit target',
    target: 'Lampara LED E27 Pack 10 unidades', category: 'Lampara',
    candidate: 'Pack X6 Lampara Led E27', expected: 'reject', severity: 'high',
  },
  {
    name: 'reject multi-pack against single-unit target',
    target: 'Lampara LED E27 9W', category: 'Lampara',
    candidate: 'Pack X10 Lampara Led E27 9W', expected: 'reject', severity: 'high',
  },
  {
    name: 'reject used item',
    target: 'Apple iPhone 15 128GB', category: 'Smartphone',
    candidate: 'Apple iPhone 15 128GB', expected: 'reject', severity: 'high', condition: 'used',
  },
  {
    name: 'reject premium brand for unknown private-label target',
    target: 'Generic Cordless Vacuum 500W', category: 'Vacuum',
    candidate: 'Aspiradora Dyson 500W', expected: 'reject', severity: 'high',
  },
  {
    name: 'retain generic carbon padel regression',
    target: 'IANONI Super Power Carbon Fiber Padel Racket', category: 'Padel racket',
    candidate: 'Paleta Padel Carbono 3K Profesional', expected: 'accept',
  },
  {
    name: 'reject premium padel brand for unknown target',
    target: 'IANONI Super Power Carbon Fiber Padel Racket', category: 'Padel racket',
    candidate: 'Paleta Padel Bullpadel Neuron Carbon 3K', expected: 'reject', severity: 'high',
  },
]

describe('Argentina market matcher V2 adversarial corpus', () => {
  it('achieves at least 95% deterministic fixture accuracy', () => {
    let correct = 0
    let falsePositives = 0
    let accepted = 0
    let trueAccepted = 0

    for (const fixture of fixtures) {
      const score = comparableScore(item(fixture.candidate, fixture.condition), fixture.target, fixture.category)
      const predicted = score >= 55 ? 'accept' : 'reject'
      if (predicted === fixture.expected) correct += 1
      if (predicted === 'accept') accepted += 1
      if (predicted === 'accept' && fixture.expected === 'accept') trueAccepted += 1
      if (predicted === 'accept' && fixture.expected === 'reject') falsePositives += 1
    }

    const expectedAccepted = fixtures.filter((fixture) => fixture.expected === 'accept').length
    const rejected = fixtures.filter((fixture) => fixture.expected === 'reject').length
    const accuracy = correct / fixtures.length
    const precision = accepted ? trueAccepted / accepted : 1
    const recall = expectedAccepted ? trueAccepted / expectedAccepted : 1
    const falsePositiveRate = rejected ? falsePositives / rejected : 0

    console.info('[market-matcher-v2]', JSON.stringify({
      fixtures: fixtures.length,
      accuracy,
      precision,
      recall,
      falsePositiveRate,
      correct,
      expectedAccepted,
      trueAccepted,
      accepted,
      falsePositives,
    }))

    expect(accuracy).toBeGreaterThanOrEqual(0.95)
    expect(precision).toBeGreaterThanOrEqual(0.95)
    expect(falsePositiveRate).toBeLessThanOrEqual(0.05)
  })

  it('hard-rejects every high-severity wrong variant/accessory/pack fixture', () => {
    const severe = fixtures.filter((fixture) => fixture.expected === 'reject' && fixture.severity === 'high')
    for (const fixture of severe) {
      const score = comparableScore(item(fixture.candidate, fixture.condition), fixture.target, fixture.category)
      expect(score, fixture.name).toBe(0)
    }
  })

  it('builds generic queries from product evidence instead of category alone', () => {
    const query = buildMarketQuery('Apple iPhone 15 128GB', 'Smartphone')
    expect(query).toContain('apple')
    expect(query).toContain('iphone')
    expect(query).toContain('15')
    expect(query).toContain('128gb')
    expect(query).toContain('smartphone')
  })
})
