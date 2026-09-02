import { describe, expect, it } from 'vitest'
import { mergeProgressiveSourceLabels } from './progressiveFunctionalDiscovery'

describe('progressive functional discovery source provenance', () => {
  it('unions changing direct-retailer health sets into one canonical label', () => {
    expect(mergeProgressiveSourceLabels(
      'Retailers argentinos directos · Frávega + Cetrogar + Sportline',
      'Retailers argentinos directos · Frávega + Cetrogar + Carrefour + Sportline',
    )).toBe('Retailers argentinos directos · Frávega + Cetrogar + Sportline + Carrefour')
  })

  it('deduplicates identical direct-retailer labels', () => {
    const label = 'Retailers argentinos directos · Frávega + Cetrogar + Naldo'
    expect(mergeProgressiveSourceLabels(label, label)).toBe(label)
  })

  it('preserves generic provenance for non-retailer providers', () => {
    expect(mergeProgressiveSourceLabels('Provider A', 'Provider B')).toBe('Provider A + Provider B')
  })
})
