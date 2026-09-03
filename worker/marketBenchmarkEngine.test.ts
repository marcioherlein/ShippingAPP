import { describe, expect, it } from 'vitest'
import { runArgentinaMarketBenchmark } from './marketBenchmarkEngine'
import type {
  ArgentinaMarketCandidate,
  ArgentinaMarketDiscoveryProvider,
  ArgentinaMarketPriceResolver,
} from './marketProviderContracts'

function candidate(id: string, title: string, priceArs: number): ArgentinaMarketCandidate {
  return {
    id,
    title,
    priceArs,
    condition: 'new',
    categoryId: 'SMARTPHONES',
    sellerKey: id.replace(/\D/g, '') || id,
    permalink: `https://example.test/${id}`,
  }
}

function provider(candidates: ArgentinaMarketCandidate[], extra: Partial<ArgentinaMarketDiscoveryProvider> = {}): ArgentinaMarketDiscoveryProvider {
  return {
    id: 'fixture-provider',
    async discover() {
      return {
        providerId: 'fixture-provider',
        sourceLabel: 'Fixture Argentina Discovery',
        candidates,
        categoryHint: { categoryId: 'SMARTPHONES', categoryName: 'Smartphones' },
      }
    },
    ...extra,
  }
}

const exact = Array.from({ length: 6 }, (_, index) => candidate(
  `AR${index + 1}`,
  `Apple iPhone 15 128GB Nuevo ${index + 1}`,
  1_000_000 + index * 20_000,
))

describe('provider-independent Argentina market benchmark engine', () => {
  it('builds a live benchmark from a non-MercadoLibre discovery provider', async () => {
    const result = await runArgentinaMarketBenchmark(
      'Apple iPhone 15 128GB',
      'Smartphone',
      provider(exact),
    )

    expect(result.status).toBe('live')
    expect(result.comparableCount).toBe(6)
    expect(result.suggestedPriceArs).toBeGreaterThan(0)
    expect(result.source).toBe('Fixture Argentina Discovery')
    expect(result.effectivePriceCount).toBe(0)
    expect(result.priceQuality).toBe('listed_search_price')
  })

  it('uses an independent effective-price resolver without coupling discovery to MercadoLibre', async () => {
    const resolver: ArgentinaMarketPriceResolver = {
      id: 'fixture-effective-price',
      async resolve(item) {
        return {
          priceArs: item.priceArs - 50_000,
          effective: true,
          sourceLabel: 'Fixture effective checkout price',
        }
      },
    }

    const result = await runArgentinaMarketBenchmark(
      'Apple iPhone 15 128GB',
      'Smartphone',
      provider(exact),
      { priceResolver: resolver },
    )

    expect(result.status).toBe('live')
    expect(result.effectivePriceCount).toBe(6)
    expect(result.priceQuality).toBe('effective_sale_price')
    expect(result.source).toContain('fixture-effective-price')
    expect(result.comparables.every((item) => item.priceSource === 'sale_price')).toBe(true)
  })

  it('fails closed when the discovery provider is unavailable', async () => {
    const broken: ArgentinaMarketDiscoveryProvider = {
      id: 'broken-provider',
      async discover() {
        throw new Error('provider timeout')
      },
    }

    const result = await runArgentinaMarketBenchmark('Apple iPhone 15 128GB', 'Smartphone', broken)
    expect(result.status).toBe('unavailable')
    expect(result.suggestedPriceArs).toBeNull()
    expect(result.comparables).toEqual([])
    expect(result.warnings.join(' ')).toContain('provider timeout')
  })

  it('refuses to promote fewer than five valid comparables into economics', async () => {
    const result = await runArgentinaMarketBenchmark(
      'Apple iPhone 15 128GB',
      'Smartphone',
      provider(exact.slice(0, 4)),
    )

    expect(result.status).toBe('insufficient')
    expect(result.comparableCount).toBe(4)
    expect(result.warnings.join(' ')).toContain('minimum live-benchmark floor is 5')
  })

  it('deduplicates provider candidates before benchmark statistics', async () => {
    const duplicate = { ...exact[0], title: 'Apple iPhone 15 128GB Otra Publicacion' }
    const result = await runArgentinaMarketBenchmark(
      'Apple iPhone 15 128GB',
      'Smartphone',
      provider([...exact, duplicate]),
    )

    expect(result.rawCount).toBe(7)
    expect(result.comparableCount).toBe(6)
  })

  it('rejects wrong variants even when discovery returns enough listings', async () => {
    const wrong = Array.from({ length: 8 }, (_, index) => candidate(
      `WRONG${index}`,
      `Apple iPhone 15 Pro 256GB Nuevo ${index}`,
      1_300_000 + index * 10_000,
    ))

    const result = await runArgentinaMarketBenchmark(
      'Apple iPhone 15 128GB',
      'Smartphone',
      provider(wrong),
    )

    expect(result.status).toBe('insufficient')
    expect(result.comparableCount).toBe(0)
    expect(result.suggestedPriceArs).toBeNull()
  })

  it('falls back to listed prices if the effective-price resolver fails per item', async () => {
    const resolver: ArgentinaMarketPriceResolver = {
      id: 'failing-resolver',
      async resolve() {
        throw new Error('price endpoint unavailable')
      },
    }

    const result = await runArgentinaMarketBenchmark(
      'Apple iPhone 15 128GB',
      'Smartphone',
      provider(exact),
      { priceResolver: resolver },
    )

    expect(result.status).toBe('live')
    expect(result.effectivePriceCount).toBe(0)
    expect(result.priceQuality).toBe('listed_search_price')
    expect(result.comparables.every((item) => item.priceSource === 'search_price')).toBe(true)
  })

  it('compacts verbose exact-product intake queries around strong model identity without relaxing matching', async () => {
    let observedQuery = ''
    const titles = [
      'Mouse Inalambrico Logitech M170 Negro',
      'Mouse Logitech M170 Wireless Negro',
      'Mouse Inalambrico Logitech M170 Gris',
      'Logitech M170 Mouse Inalambrico',
      'Mouse Logitech M170 USB Inalambrico',
      'Mouse Inalambrico M170 Logitech',
    ]
    const m170Candidates = titles.map((title, index) => ({
      ...candidate(`M170-${index + 1}`, title, 25_000 + index * 500),
      categoryId: undefined,
    }))
    const trackingProvider: ArgentinaMarketDiscoveryProvider = {
      id: 'tracking-provider',
      async discover(input) {
        observedQuery = input.query
        return {
          providerId: 'tracking-provider',
          sourceLabel: 'Tracking Argentina Discovery',
          candidates: m170Candidates,
        }
      },
    }

    const result = await runArgentinaMarketBenchmark(
      'Mouse inalámbrico Logitech M170 para computadora',
      'Computer mouse',
      trackingProvider,
    )

    expect(observedQuery).toBe('logitech m170')
    expect(result.query).toBe('logitech m170')
    expect(result.status).toBe('live')
    expect(result.comparableCount).toBe(6)
    expect(result.warnings.join(' ')).toContain('deterministic exact matching still gates every accepted comparable')
  })
})

describe('unauthenticated public-fallback credibility cap', () => {
  const exactSet = Array.from({ length: 6 }, (_, index) => candidate(
    `AR${index + 1}`,
    `Apple iPhone 15 128GB Nuevo ${index + 1}`,
    1_000_000 + index * 20_000,
  ))

  it('caps confidence and warns when the listing search used an unauthenticated public retry', async () => {
    const publicFallbackProvider = provider(exactSet, {
      async discover() {
        return {
          providerId: 'mercadolibre-argentina',
          sourceLabel: 'Mercado Libre Argentina API · public search fallback after token validation',
          candidates: exactSet,
          categoryHint: { categoryId: 'SMARTPHONES', categoryName: 'Smartphones' },
          warnings: ['MercadoLibre token was validated through /users/me, but listing search used a public retry after Bearer was rejected for that endpoint.'],
        }
      },
    })
    const result = await runArgentinaMarketBenchmark('Apple iPhone 15 128GB', 'Smartphone', publicFallbackProvider)
    // Still usable (coverage preserved) but visibly lower-trust.
    expect(result.status).toBe('live')
    expect(result.confidence).toBeLessThanOrEqual(45)
    expect(result.warnings.join(' ')).toMatch(/sin autenticaci/i)
  })

  it('does NOT cap confidence for an authenticated search', async () => {
    const authedProvider = provider(exactSet, {
      async discover() {
        return {
          providerId: 'mercadolibre-argentina',
          sourceLabel: 'Mercado Libre Argentina API · authenticated search',
          candidates: exactSet,
          categoryHint: { categoryId: 'SMARTPHONES', categoryName: 'Smartphones' },
        }
      },
    })
    const result = await runArgentinaMarketBenchmark('Apple iPhone 15 128GB', 'Smartphone', authedProvider)
    expect(result.warnings.join(' ')).not.toMatch(/sin autenticaci/i)
  })
})
