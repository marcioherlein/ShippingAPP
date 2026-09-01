import { describe, expect, it } from 'vitest'
import { passesFunctionalTraitEvidence, withFunctionalTraitEvidenceGuard } from './functionalTraitEvidence'
import type { ArgentinaMarketCandidate, ArgentinaMarketDiscoveryProvider } from './marketProviderContracts'

function candidate(title: string, attributes: ArgentinaMarketCandidate['attributes'] = []): ArgentinaMarketCandidate {
  return {
    id: title,
    title,
    priceArs: 100000,
    condition: 'new',
    attributes,
  }
}

function provider(candidates: ArgentinaMarketCandidate[]): ArgentinaMarketDiscoveryProvider {
  return {
    id: 'test-provider',
    async discover() {
      return {
        providerId: 'test-provider',
        sourceLabel: 'Test provider',
        candidates,
        warnings: [],
      }
    },
  }
}

describe('shared functional trait evidence guard', () => {
  it('rejects functional smartwatch candidates that do not prove GPS', () => {
    expect(passesFunctionalTraitEvidence(
      candidate('Smartwatch 1.4 pulgadas Bluetooth'),
      'Smartwatch GPS 1.4 pulgadas sin marca',
    )).toBe(false)
  })

  it('accepts GPS from structured attributes, not only the title', () => {
    expect(passesFunctionalTraitEvidence(
      candidate('Smartwatch 1.4 pulgadas Bluetooth', [{ name: 'Posicionamiento', value_name: 'GPS integrado' }]),
      'Smartwatch GPS 1.4 pulgadas sin marca',
    )).toBe(true)
  })

  it('accepts grafito/graphite evidence and rejects aluminum-only rackets', () => {
    expect(passesFunctionalTraitEvidence(
      candidate('Raqueta de tenis Graphite 300g'),
      'Raqueta de tenis grafito 300g sin marca',
    )).toBe(true)
    expect(passesFunctionalTraitEvidence(
      candidate('Raqueta de tenis 300g', [{ name: 'Material', value_name: 'Grafito' }]),
      'Raqueta de tenis graphite 300g sin marca',
    )).toBe(true)
    expect(passesFunctionalTraitEvidence(
      candidate('Raqueta de tenis aluminio 300g'),
      'Raqueta de tenis grafito 300g sin marca',
    )).toBe(false)
  })

  it('leaves exact branded discovery untouched', async () => {
    const rows = [candidate('Garmin Forerunner 55')]
    const guarded = withFunctionalTraitEvidenceGuard(provider(rows))
    const result = await guarded.discover({
      query: 'garmin forerunner 55',
      productName: 'Garmin Forerunner 55 GPS',
      category: 'reloj deportivo gps',
    })
    expect(result.candidates).toEqual(rows)
  })

  it('filters missing critical evidence in any functional provider and reports the rejection count', async () => {
    const guarded = withFunctionalTraitEvidenceGuard(provider([
      candidate('Smartwatch 1.4 pulgadas Bluetooth'),
      candidate('Smartwatch GPS 1.4 pulgadas Bluetooth'),
      candidate('Smartwatch 1.4 pulgadas', [{ name: 'GPS', value_name: 'Sí' }]),
    ]))
    const result = await guarded.discover({
      query: 'smartwatch',
      productName: 'Smartwatch GPS 1.4 pulgadas sin marca',
      category: 'smartwatch',
    })

    expect(result.candidates).toHaveLength(2)
    expect(result.warnings?.join(' ')).toContain('rejected 1 candidate')
  })
})
