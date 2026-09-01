import { describe, expect, it } from 'vitest'
import { runArgentinaMarketBenchmark } from './marketBenchmarkEngine'
import type { ArgentinaMarketDiscoveryProvider } from './marketProviderContracts'

function providerFor(titles: string[], observedQueries: string[] = []): ArgentinaMarketDiscoveryProvider {
  return {
    id: 'test-direct-retailers',
    async discover(context) {
      observedQueries.push(context.query)
      return {
        providerId: 'test-direct-retailers',
        sourceLabel: 'Retailers argentinos directos · Test',
        candidates: titles.map((title, index) => ({
          id: `test-${index + 1}`,
          title,
          priceArs: 100000 + index * 5000,
          condition: 'new',
          sellerKey: `Test:${index + 1}`,
          permalink: `https://example.com/p/${index + 1}`,
        })),
      }
    },
  }
}

describe('Argentina market benchmark exact vs functional modes', () => {
  it('produces a live functional-equivalent range for a private-label product', async () => {
    const queries: string[] = []
    const result = await runArgentinaMarketBenchmark(
      'IANONI Super Power Carbon Fiber Padel Racket',
      'paleta de padel',
      providerFor([
        'Paleta Padel Carbono 3K EVA Profesional Negra',
        'Paleta Padel Carbono 12K EVA Forma Diamante',
        'Paleta de Padel Carbono EVA Profesional Roja',
        'Raqueta Padel Carbono 18K EVA Premium',
        'Paleta Padel Carbon Fiber EVA Profesional',
        'Paleta Padel Carbono 6K EVA Competicion',
      ], queries),
    )

    expect(result.status).toBe('live')
    expect(result.matchMode).toBe('functional')
    expect(result.comparableCount).toBeGreaterThanOrEqual(5)
    expect(result.confidence).toBeLessThanOrEqual(80)
    expect(result.warnings.join(' ')).toContain('functional-equivalent matching')
    expect(result.comparables.every((row) => row.reason.includes('functional'))).toBe(true)
    expect(queries[0]).not.toContain('ianoni')
  })

  it('fails closed in functional mode when explicit product specs conflict', async () => {
    const result = await runArgentinaMarketBenchmark(
      'Generic Cordless Vacuum 500W',
      'aspiradora',
      providerFor([
        'Aspiradora Inalambrica 700W Modelo A',
        'Aspiradora Inalambrica 700W Modelo B',
        'Aspiradora Inalambrica 700W Modelo C',
        'Aspiradora Inalambrica 700W Modelo D',
        'Aspiradora Inalambrica 700W Modelo E',
        'Aspiradora Inalambrica 700W Modelo F',
      ]),
    )

    expect(result.matchMode).toBe('functional')
    expect(result.status).toBe('insufficient')
    expect(result.comparableCount).toBe(0)
  })

  it('preserves exact matching for branded/model-specific products', async () => {
    const result = await runArgentinaMarketBenchmark(
      'Apple iPhone 16 128GB',
      'celular',
      providerFor([
        'Apple iPhone 16 128GB Negro',
        'Apple iPhone 16 128GB Blanco',
        'Apple iPhone 16 128GB Azul',
        'Apple iPhone 16 128GB Verde',
        'Apple iPhone 16 128GB Rosa',
        'Apple iPhone 15 128GB Negro',
      ]),
    )

    expect(result.matchMode).toBe('exact')
    expect(result.status).toBe('live')
    expect(result.comparables.some((row) => row.title.includes('iPhone 15'))).toBe(false)
    expect(result.warnings.join(' ')).toContain('exact-identity matching')
  })

  it('does not let wrong material or gas/electric variants inflate a functional benchmark', async () => {
    const padel = await runArgentinaMarketBenchmark(
      'Generic Carbon Padel Racket',
      'paleta de padel',
      providerFor([
        'Paleta Padel Fibra de Vidrio EVA A',
        'Paleta Padel Fibra de Vidrio EVA B',
        'Paleta Padel Fibra de Vidrio EVA C',
        'Paleta Padel Fibra de Vidrio EVA D',
        'Paleta Padel Fibra de Vidrio EVA E',
      ]),
    )
    const heater = await runArgentinaMarketBenchmark(
      'Termotanque electrico 80 litros sin marca',
      'termotanque',
      providerFor([
        'Termotanque a Gas 80 Litros A',
        'Termotanque a Gas 80 Litros B',
        'Termotanque a Gas 80 Litros C',
        'Termotanque a Gas 80 Litros D',
        'Termotanque a Gas 80 Litros E',
      ]),
    )

    expect(padel.status).toBe('insufficient')
    expect(padel.comparableCount).toBe(0)
    expect(heater.status).toBe('insufficient')
    expect(heater.comparableCount).toBe(0)
  })
})
