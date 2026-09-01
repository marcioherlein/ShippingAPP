import { describe, expect, it } from 'vitest'
import { runArgentinaMarketBenchmark } from './marketBenchmarkEngine'
import { withProgressiveFunctionalDiscovery } from './progressiveFunctionalDiscovery'
import type { ArgentinaMarketCandidate, ArgentinaMarketDiscoveryProvider } from './marketProviderContracts'

function candidate(title: string, index: number, attributes?: ArgentinaMarketCandidate['attributes']): ArgentinaMarketCandidate {
  return {
    id: `test-${index}`,
    title,
    priceArs: 100000 + index * 5000,
    condition: 'new',
    sellerKey: `Test:${index}`,
    permalink: `https://example.com/p/${index}`,
    attributes,
  }
}

function stagedProvider(
  calls: string[],
  strictCandidates: ArgentinaMarketCandidate[],
  relaxedCandidates: ArgentinaMarketCandidate[],
): ArgentinaMarketDiscoveryProvider {
  return {
    id: 'argentina-direct-retailers',
    async discover(context) {
      calls.push(context.query)
      return {
        providerId: 'argentina-direct-retailers',
        sourceLabel: 'Retailers argentinos directos · Test',
        candidates: calls.length === 1 ? strictCandidates : relaxedCandidates,
        warnings: [],
      }
    },
  }
}

describe('progressive functional retailer discovery', () => {
  it('keeps exact-mode branded requests single-shot', async () => {
    const calls: string[] = []
    const provider = withProgressiveFunctionalDiscovery(stagedProvider(calls, [
      candidate('Apple iPhone 16 128GB Negro', 1),
      candidate('Apple iPhone 16 128GB Blanco', 2),
      candidate('Apple iPhone 16 128GB Azul', 3),
      candidate('Apple iPhone 16 128GB Verde', 4),
      candidate('Apple iPhone 16 128GB Rosa', 5),
    ], []))

    const result = await runArgentinaMarketBenchmark('Apple iPhone 16 128GB', 'celular', provider)

    expect(result.status).toBe('live')
    expect(result.matchMode).toBe('exact')
    expect(calls).toHaveLength(1)
  })

  it('widens an over-constrained free storefront query to category-only and recovers a live benchmark without changing matching', async () => {
    const calls: string[] = []
    const relaxed = [
      candidate('Freidora de aire 6L 1700W Modelo A', 1),
      candidate('Freidora de aire 6L 1700W Modelo B', 2),
      candidate('Freidora de aire 6L 1700W Modelo C', 3),
      candidate('Freidora de aire 6L 1700W Modelo D', 4),
      candidate('Freidora de aire 6L 1700W Modelo E', 5),
      candidate('Freidora de aire 6L 1700W Modelo F', 6),
    ]
    const provider = withProgressiveFunctionalDiscovery(stagedProvider(calls, [], relaxed))

    const result = await runArgentinaMarketBenchmark('Freidora de aire 6L 1700W sin marca', 'freidora de aire', provider)

    expect(result.status).toBe('live')
    expect(result.matchMode).toBe('functional')
    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain('6l')
    expect(calls[0]).toContain('1700w')
    expect(calls[1]).toContain('freidora')
    expect(calls[1]).not.toContain('6l')
    expect(calls[1]).not.toContain('1700w')
    expect(result.warnings.join(' ')).toContain('category-only')
  })

  it('fails closed when category-only discovery returns wrong explicit specs', async () => {
    const calls: string[] = []
    const wrong = [1, 2, 3, 4, 5, 6].map((index) => candidate(`Freidora de aire 5L 1500W Modelo ${index}`, index))
    const provider = withProgressiveFunctionalDiscovery(stagedProvider(calls, [], wrong))

    const result = await runArgentinaMarketBenchmark('Freidora de aire 6L 1700W sin marca', 'freidora de aire', provider)

    expect(calls).toHaveLength(2)
    expect(result.status).toBe('insufficient')
    expect(result.comparableCount).toBe(0)
  })

  it('requires GPS evidence after query relaxation but accepts it from structured retailer attributes', async () => {
    const noGpsCalls: string[] = []
    const noGps = [1, 2, 3, 4, 5, 6].map((index) => candidate(`Smartwatch 1.4 pulgadas Bluetooth Modelo ${index}`, index))
    const noGpsProvider = withProgressiveFunctionalDiscovery(stagedProvider(noGpsCalls, [], noGps))
    const noGpsResult = await runArgentinaMarketBenchmark('Smartwatch GPS 1.4 pulgadas sin marca', 'smartwatch', noGpsProvider)

    expect(noGpsResult.status).toBe('insufficient')
    expect(noGpsResult.comparableCount).toBe(0)

    const gpsCalls: string[] = []
    const withGps = [1, 2, 3, 4, 5, 6].map((index) => candidate(
      `Smartwatch 1.4 pulgadas Bluetooth Modelo ${index}`,
      index,
      [{ name: 'GPS', value_name: 'GPS integrado' }],
    ))
    const gpsProvider = withProgressiveFunctionalDiscovery(stagedProvider(gpsCalls, [], withGps))
    const gpsResult = await runArgentinaMarketBenchmark('Smartwatch GPS 1.4 pulgadas sin marca', 'smartwatch', gpsProvider)

    expect(gpsResult.status).toBe('live')
    expect(gpsResult.comparableCount).toBeGreaterThanOrEqual(5)
  })

  it('does not allow non-graphite tennis rackets into a category-only 300g benchmark', async () => {
    const calls: string[] = []
    const wrongMaterial = [1, 2, 3, 4, 5, 6].map((index) => candidate(`Raqueta de tenis aluminio 300g Modelo ${index}`, index))
    const provider = withProgressiveFunctionalDiscovery(stagedProvider(calls, [], wrongMaterial))

    const result = await runArgentinaMarketBenchmark('Raqueta de tenis grafito 300g sin marca', 'raqueta de tenis', provider)

    expect(calls).toHaveLength(2)
    expect(result.status).toBe('insufficient')
    expect(result.comparableCount).toBe(0)
  })

  it('does not spend a second retailer round when strict discovery already has the live floor', async () => {
    const calls: string[] = []
    const strict = [1, 2, 3, 4, 5, 6].map((index) => candidate(`Taladro percutor 650W 13mm Modelo ${index}`, index))
    const provider = withProgressiveFunctionalDiscovery(stagedProvider(calls, strict, []))

    const result = await runArgentinaMarketBenchmark('Taladro percutor 650W 13mm sin marca', 'taladro percutor', provider)

    expect(result.status).toBe('live')
    expect(calls).toHaveLength(1)
  })
})
