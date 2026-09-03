import { describe, expect, it } from 'vitest'
import { runArgentinaMarketBenchmark } from './marketBenchmarkEngine'
import type { ArgentinaMarketDiscoveryProvider } from './marketProviderContracts'

function candidate(id: string, title: string, priceArs: number, retailer: string) {
  return {
    id,
    title,
    priceArs,
    condition: 'new',
    sellerKey: `${retailer}:seller`,
  }
}

describe('accepted Argentina market source provenance', () => {
  it('does not name a retailer whose raw candidates are all rejected by the matcher', async () => {
    const provider: ArgentinaMarketDiscoveryProvider = {
      id: 'argentina-direct-retailers',
      async discover() {
        return {
          providerId: 'argentina-direct-retailers',
          sourceLabel: 'Retailers argentinos directos · Frávega + Sony Store Oficial',
          candidates: [
            candidate('fravega:1', 'Mouse Inalámbrico Logitech M170 Negro', 16000, 'Frávega'),
            candidate('fravega:2', 'Mouse Wireless Logitech M170 Azul', 16500, 'Frávega'),
            candidate('fravega:3', 'Mouse Logitech M170 Inalámbrico Rojo', 17000, 'Frávega'),
            candidate('fravega:4', 'Mouse Logitech M170 Wireless Gris', 17500, 'Frávega'),
            candidate('fravega:5', 'Mouse Inalámbrico Logitech M170 Black', 18000, 'Frávega'),
            candidate('sony-official:bad', 'Auriculares Sony WH-1000XM5', 450000, 'Sony Store Oficial'),
          ],
          warnings: [],
        }
      },
    }

    const result = await runArgentinaMarketBenchmark('Logitech M170', 'mouse inalámbrico', provider)
    expect(result.status).toBe('live')
    expect(result.comparableCount).toBe(5)
    expect(result.source).toBe('Retailers argentinos directos · Frávega')
    expect(result.source).not.toContain('Sony')
  })

  it('names every direct retailer that contributes an accepted comparable', async () => {
    const provider: ArgentinaMarketDiscoveryProvider = {
      id: 'argentina-direct-retailers',
      async discover() {
        return {
          providerId: 'argentina-direct-retailers',
          sourceLabel: 'Retailers argentinos directos · Frávega + OnCity',
          candidates: [
            candidate('fravega:1', 'Mouse Inalámbrico Logitech M170 Negro', 16000, 'Frávega'),
            candidate('fravega:2', 'Mouse Wireless Logitech M170 Azul', 16500, 'Frávega'),
            candidate('fravega:3', 'Mouse Logitech M170 Inalámbrico Rojo', 17000, 'Frávega'),
            candidate('oncity:1', 'Mouse Logitech M170 Wireless Gris', 17500, 'OnCity'),
            candidate('oncity:2', 'Mouse Inalámbrico Logitech M170 Black', 18000, 'OnCity'),
          ],
          warnings: [],
        }
      },
    }

    const result = await runArgentinaMarketBenchmark('Logitech M170', 'mouse inalámbrico', provider)
    expect(result.status).toBe('live')
    expect(result.source).toBe('Retailers argentinos directos · Frávega + OnCity')
  })
})
