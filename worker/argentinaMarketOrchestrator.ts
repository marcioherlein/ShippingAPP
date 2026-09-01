import { analyzeArgentinaMarket } from './catalogProvider'
import { withFunctionalTraitEvidenceGuard } from './functionalTraitEvidence'
import { createGoogleShoppingArgentinaProvider } from './googleShoppingMarketProvider'
import { runArgentinaMarketBenchmark } from './marketBenchmarkEngine'
import { createMercadoLibreMarketProviders } from './mercadoLibreMarketProvider'
import type { ArgentinaMarketPriceResolver } from './marketProviderContracts'
import type { ArgentinaMarketResult } from './marketTypes'
import { withProgressiveFunctionalDiscovery } from './progressiveFunctionalDiscovery'
import { createArgentinaDirectRetailerProvider } from './vtexRetailerMarketProvider'

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

function chooseNonLive(...results: ArgentinaMarketResult[]) {
  return [...results].sort((left, right) => {
    const rankDelta = fallbackRank(right) - fallbackRank(left)
    if (rankDelta) return rankDelta
    return right.comparableCount - left.comparableCount
  })[0]
}

function evidenceSummary(label: string, result: ArgentinaMarketResult) {
  return `${label} returned ${result.status} with ${result.comparableCount} accepted comparable(s)`
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

  if (primary.status === 'live') return primary

  const retailerBase = withFunctionalTraitEvidenceGuard(createArgentinaDirectRetailerProvider({
    fetchImpl: options.fetchImpl,
  }))
  const retailerProvider = withProgressiveFunctionalDiscovery(retailerBase)
  const retailers = await runArgentinaMarketBenchmark(productName, category, retailerProvider)

  if (retailers.status === 'live') {
    retailers.warnings.unshift(
      `${evidenceSummary('Mercado Libre primary discovery', primary)}; direct Argentine retailers produced the live benchmark without a paid search API.`,
    )
    return retailers
  }

  if (!googleShoppingApiKey) {
    const chosen = chooseNonLive(primary, retailers)
    chosen.warnings.push(
      `Secondary Argentina market evidence also did not reach the live floor. Free discovery summary: ${evidenceSummary('Mercado Libre', primary)}; ${evidenceSummary('direct retailers', retailers)}.`,
    )
    return chosen
  }

  const googleProvider = withFunctionalTraitEvidenceGuard(createGoogleShoppingArgentinaProvider({
    apiKey: googleShoppingApiKey,
    fetchImpl: options.fetchImpl,
  }))

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

  const google = await runArgentinaMarketBenchmark(productName, category, googleProvider, {
    priceResolver: effectivePriceResolver,
    priceLookupLimit: Math.max(0, Math.min(30, options.salePriceLookupLimit ?? 24)),
  })

  if (google.status === 'live') {
    google.warnings.unshift(
      `${evidenceSummary('Mercado Libre primary discovery', primary)}; ${evidenceSummary('direct retailer discovery', retailers)}; Google Shopping Argentina fallback produced the live benchmark.`,
    )
    return google
  }

  const chosen = chooseNonLive(primary, retailers, google)
  chosen.warnings.push(
    `Secondary Argentina market evidence also did not reach the live floor. Argentina market summary: ${evidenceSummary('Mercado Libre', primary)}; ${evidenceSummary('direct retailers', retailers)}; ${evidenceSummary('Google Shopping', google)}.`,
  )
  return chosen
}
