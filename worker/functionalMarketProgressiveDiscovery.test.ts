import { describe, expect, it } from 'vitest'
import { runArgentinaMarketBenchmark } from './marketBenchmarkEngine'
import {
  buildArgentinaFunctionalDiscoveryQueries,
  buildArgentinaFunctionalMarketQuery,
} from './functionalMarketQuery'
import type { ArgentinaMarketCandidate, ArgentinaMarketDiscoveryProvider } from './marketProviderContracts'

function candidate(id: string, title: string, attributes: Array<{ value_name?: string }> = []): ArgentinaMarketCandidate {
  return {
    id,
    title,
    priceArs: 100000 + Number(id.replace(/\D/g, '') || 0) * 1000,
    condition: 'new',
    sellerKey: `seller-${id}`,
    permalink: `https://example.com/${id}`,
    attributes,
  }
}

function stagedProvider(
  handler: (query: string) => ArgentinaMarketCandidate[],
  observedQueries: string[],
): ArgentinaMarketDiscoveryProvider {
  return {
    id: 'staged-test-provider',
    async discover(context) {
      observedQueries.push(context.query)
      return {
        providerId: 'staged-test-provider',
        sourceLabel: 'Retailers argentinos directos · staged test',
        candidates: handler(context.query),
      }
    },
  }
}

const sixAirFryers = () => Array.from({ length: 6 }, (_, index) => (
  candidate(`air-${index + 1}`, `Freidora de aire 6L 1700W Modelo ${index + 1}`)
))

describe('progressive functional market discovery', () => {
  it('localizes proof-required traits and builds deterministic widening stages', () => {
    expect(buildArgentinaFunctionalMarketQuery(
      'Camara seguridad WiFi exterior 3MP sin marca',
      'camara de seguridad',
    )).toContain('exterior')
    expect(buildArgentinaFunctionalMarketQuery(
      'Mancuerna ajustable 20kg sin marca',
      'mancuerna',
    )).toContain('ajustable')

    const cameraQueries = buildArgentinaFunctionalDiscoveryQueries(
      'Camara seguridad WiFi exterior 3MP sin marca',
      'camara de seguridad',
    )
    expect(cameraQueries[0]).toContain('3mp')
    expect(cameraQueries[0]).toContain('exterior')
    expect(cameraQueries[1]).not.toContain('3mp')
    expect(cameraQueries.at(-1)).toBe('camara seguridad')

    const dumbbellQueries = buildArgentinaFunctionalDiscoveryQueries(
      'Mancuerna ajustable 20kg sin marca',
      'mancuerna',
    )
    expect(dumbbellQueries).toEqual(['mancuerna ajustable 20kg', 'mancuerna ajustable', 'mancuerna'])
  })

  it('widens discovery only after the strict functional query misses the live floor', async () => {
    const queries: string[] = []
    const result = await runArgentinaMarketBenchmark(
      'Freidora de aire 6L 1700W sin marca',
      'freidora de aire',
      stagedProvider((query) => query.includes('1700w') ? [] : sixAirFryers(), queries),
    )

    expect(result.status).toBe('live')
    expect(result.matchMode).toBe('functional')
    expect(result.comparableCount).toBeGreaterThanOrEqual(5)
    expect(queries.length).toBe(2)
    expect(queries[0]).toContain('1700w')
    expect(queries[1]).not.toContain('1700w')
    expect(result.warnings.join(' ')).toContain('deterministic matcher thresholds remained unchanged')
  })

  it('does not pay for wider discovery when the strict query already has enough matches', async () => {
    const queries: string[] = []
    const result = await runArgentinaMarketBenchmark(
      'Freidora de aire 6L 1700W sin marca',
      'freidora de aire',
      stagedProvider(() => sixAirFryers(), queries),
    )

    expect(result.status).toBe('live')
    expect(queries).toHaveLength(1)
  })

  it('keeps fail-closed matching after category-only discovery returns wrong specs', async () => {
    const queries: string[] = []
    const wrong = Array.from({ length: 6 }, (_, index) => (
      candidate(`wrong-${index + 1}`, `Freidora de aire 5L 1500W Modelo ${index + 1}`)
    ))
    const result = await runArgentinaMarketBenchmark(
      'Freidora de aire 6L 1700W sin marca',
      'freidora de aire',
      stagedProvider((query) => query.includes('1700w') ? [] : wrong, queries),
    )

    expect(result.status).toBe('insufficient')
    expect(result.comparableCount).toBe(0)
    expect(queries.length).toBeGreaterThanOrEqual(2)
  })

  it('deduplicates candidates found again by wider stages', async () => {
    const queries: string[] = []
    const first = sixAirFryers().slice(0, 2)
    const all = sixAirFryers()
    const result = await runArgentinaMarketBenchmark(
      'Freidora de aire 6L 1700W sin marca',
      'freidora de aire',
      stagedProvider((query) => query.includes('1700w') ? first : all, queries),
    )

    expect(result.status).toBe('live')
    expect(result.rawCount).toBe(6)
    expect(result.comparableCount).toBe(6)
  })

  it('never widens exact branded/model discovery', async () => {
    const queries: string[] = []
    const iphones = Array.from({ length: 5 }, (_, index) => (
      candidate(`iphone-${index + 1}`, `Apple iPhone 16 128GB Color ${index + 1}`)
    ))
    const result = await runArgentinaMarketBenchmark(
      'Apple iPhone 16 128GB',
      'celular',
      stagedProvider(() => iphones, queries),
    )

    expect(result.status).toBe('live')
    expect(result.matchMode).toBe('exact')
    expect(queries).toHaveLength(1)
  })
})
