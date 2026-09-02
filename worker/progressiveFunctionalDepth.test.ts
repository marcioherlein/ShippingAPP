import { describe, expect, it } from 'vitest'
import { runArgentinaMarketBenchmark } from './marketBenchmarkEngine'
import { withProgressiveFunctionalDiscovery } from './progressiveFunctionalDiscovery'
import type { ArgentinaMarketCandidate, ArgentinaMarketDiscoveryProvider } from './marketProviderContracts'

function candidate(title: string, index: number): ArgentinaMarketCandidate {
  return {
    id: `depth-${index}`,
    title,
    priceArs: 100000 + index * 1000,
    condition: 'new',
    sellerKey: `Depth:${index}`,
  }
}

function provider(label: string, calls: string[], candidates: ArgentinaMarketCandidate[]): ArgentinaMarketDiscoveryProvider {
  return {
    id: label,
    async discover(context) {
      calls.push(context.query)
      return {
        providerId: label,
        sourceLabel: label,
        candidates,
        warnings: [],
      }
    },
  }
}

describe('progressive functional discovery depth', () => {
  it('uses the dedicated deeper provider only for the relaxed functional round', async () => {
    const strictCalls: string[] = []
    const relaxedCalls: string[] = []
    const strict = provider('strict-12', strictCalls, [])
    const deepCandidates = [1, 2, 3, 4, 5, 6].map((index) => candidate(`Freidora de aire 6L 1700W Modelo ${index}`, index))
    const relaxed = provider('relaxed-30', relaxedCalls, deepCandidates)

    const result = await runArgentinaMarketBenchmark(
      'Freidora de aire 6L 1700W sin marca',
      'freidora de aire',
      withProgressiveFunctionalDiscovery(strict, relaxed),
    )

    expect(result.status).toBe('live')
    expect(strictCalls).toHaveLength(1)
    expect(relaxedCalls).toHaveLength(1)
    expect(strictCalls[0]).toContain('1700w')
    expect(relaxedCalls[0]).toContain('freidora')
    expect(relaxedCalls[0]).not.toContain('1700w')
  })

  it('never invokes the deeper provider for exact-mode requests', async () => {
    const strictCalls: string[] = []
    const relaxedCalls: string[] = []
    const exactCandidates = [1, 2, 3, 4, 5].map((index) => candidate(`Apple iPhone 16 128GB Variante ${index}`, index))
    const strict = provider('strict-12', strictCalls, exactCandidates)
    const relaxed = provider('relaxed-30', relaxedCalls, [])

    const result = await runArgentinaMarketBenchmark(
      'Apple iPhone 16 128GB',
      'celular',
      withProgressiveFunctionalDiscovery(strict, relaxed),
    )

    expect(result.matchMode).toBe('exact')
    expect(result.status).toBe('live')
    expect(strictCalls).toHaveLength(1)
    expect(relaxedCalls).toHaveLength(0)
  })

  it('never invokes the deeper provider when strict functional evidence already meets the live floor', async () => {
    const strictCalls: string[] = []
    const relaxedCalls: string[] = []
    const strictCandidates = [1, 2, 3, 4, 5, 6].map((index) => candidate(`Taladro percutor 650W 13mm Modelo ${index}`, index))
    const strict = provider('strict-12', strictCalls, strictCandidates)
    const relaxed = provider('relaxed-30', relaxedCalls, [])

    const result = await runArgentinaMarketBenchmark(
      'Taladro percutor 650W 13mm sin marca',
      'taladro percutor',
      withProgressiveFunctionalDiscovery(strict, relaxed),
    )

    expect(result.status).toBe('live')
    expect(strictCalls).toHaveLength(1)
    expect(relaxedCalls).toHaveLength(0)
  })
})
