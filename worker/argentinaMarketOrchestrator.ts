import { analyzeArgentinaMarket } from './catalogProvider'
import { createGoogleShoppingArgentinaProvider } from './googleShoppingMarketProvider'
import { runArgentinaMarketBenchmark } from './marketBenchmarkEngine'
import { createMercadoLibreMarketProviders } from './mercadoLibreMarketProvider'
import type { ArgentinaMarketPriceResolver } from './marketProviderContracts'
import type { ArgentinaMarketResult } from './marketTypes'

export type ArgentinaMarketHybridOptions = {
  mercadoLibreAccessToken?: string | null
  googleShoppingApiKey?: string | null
  fetchImpl?: typeof fetch
  salePriceLookupLimit?: number
}

function isMercadoLibreItemId(value: string) {
  return /^MLA\d{6,}$/.test(value)
}

function fallbackRank(result: ArgentinaMarketResult) {
  if (result.status === 'live') return 4
  if (result.status === 'insufficient') return 3
  if (result.status === 'unavailable') return 2
  return 1
}

function chooseNonLive(primary: ArgentinaMarketResult, secondary: ArgentinaMarketResult) {
  const primaryRank = fallbackRank(primary)
  const secondaryRank = fallbackRank(secondary)
  if (secondaryRank > primaryRank) return secondary
  if (primaryRank > secondaryRank) return primary
  if (secondary.comparableCount > primary.comparableCount) return secondary
  return primary
}

export async function analyzeArgentinaMarketHybrid(
  productName: string,
  category: string,
  options: ArgentinaMarketHybridOptions = {},
): Promise<ArgentinaMarketResult> {
  const accessToken = options.mercadoLibreAccessToken?.trim() || null
  const googleShoppingApiKey = options.googleShoppingApiKey?.trim() || null

  const primary = await analyzeArgentinaMarket(productName, category, {
    accessToken,
    fetchImpl: options.fetchImpl,
    salePriceLookupLimit: options.salePriceLookupLimit,
  })

  if (primary.status === 'live' || !googleShoppingApiKey) return primary

  const googleProvider = createGoogleShoppingArgentinaProvider({
    apiKey: googleShoppingApiKey,
    fetchImpl: options.fetchImpl,
  })

  let effectivePriceResolver: ArgentinaMarketPriceResolver | null = null
  if (accessToken) {
    const { priceResolver } = createMercadoLibreMarketProviders({
      accessToken,
      fetchImpl: options.fetchImpl,
    })
    effectivePriceResolver = {
      id: 'Mercado Libre effective sale_price for discovered MLA items',
      async resolve(candidate) {
        if (!isMercadoLibreItemId(candidate.id)) return null
        return priceResolver.resolve(candidate)
      },
    }
  }

  const secondary = await runArgentinaMarketBenchmark(productName, category, googleProvider, {
    priceResolver: effectivePriceResolver,
    priceLookupLimit: Math.max(0, Math.min(30, options.salePriceLookupLimit ?? 24)),
  })

  if (secondary.status === 'live') {
    secondary.warnings.unshift(
      `Mercado Libre primary discovery returned ${primary.status} with ${primary.comparableCount} accepted comparable(s); Google Shopping Argentina fallback produced the live benchmark.`,
    )
    return secondary
  }

  const chosen = chooseNonLive(primary, secondary)
  const other = chosen === primary ? secondary : primary
  chosen.warnings.push(
    `Secondary Argentina market evidence also did not reach the live floor: ${other.source} returned ${other.status} with ${other.comparableCount} accepted comparable(s).`,
  )
  return chosen
}
