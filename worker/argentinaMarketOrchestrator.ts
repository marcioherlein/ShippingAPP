import { analyzeArgentinaMarket } from './catalogProvider'
import { inferArgentinaMarketMatchMode } from './functionalMarketMatch'
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

async function analyzeDirectRetailers(
  productName: string,
  category: string,
  options: ArgentinaMarketHybridOptions,
) {
  const retailerBase = withFunctionalTraitEvidenceGuard(createArgentinaDirectRetailerProvider({
    fetchImpl: options.fetchImpl,
  }))
  const retailerProvider = withProgressiveFunctionalDiscovery(retailerBase)
  return runArgentinaMarketBenchmark(productName, category, retailerProvider)
}

export async function analyzeArgentinaMarketHybrid(
  productName: string,
  category: string,
  options: ArgentinaMarketHybridOptions = {},
): Promise<ArgentinaMarketResult> {
  const accessToken = options.mercadoLibreAccessToken?.trim() || null
  const googleShoppingApiKey = options.googleShoppingApiKey?.trim() || null
  const matchMode = inferArgentinaMarketMatchMode(productName, category)

  // Functional/private-label discovery can require two bounded retailer rounds
  // (strict + category-only). Running Mercado Libre's currently degraded catalog
  // hydration first can consume another large block of subrequests and push the
  // whole intake above the Cloudflare Worker budget. Keep the same deterministic
  // matcher, but prioritize the free direct-retailer evidence and skip ML network
  // discovery entirely for functional mode. Mercado Libre remains primary for
  // exact SKU/model requests and retains its dedicated production diagnostic.
  if (matchMode === 'functional') {
    const retailers = await analyzeDirectRetailers(productName, category, options)
    if (retailers.status === 'live') {
      retailers.warnings.unshift(
        'Functional benchmark used direct Argentine retailers first; Mercado Libre discovery was skipped to keep the multi-store search within the Worker subrequest budget. Every accepted comparable still passed the deterministic functional matcher and critical-trait evidence gate.',
      )
      return retailers
    }

    if (!googleShoppingApiKey) {
      retailers.warnings.push(
        `Functional benchmark remained fail-closed after direct retailer discovery (${retailers.comparableCount} accepted comparable(s)); Mercado Libre was intentionally skipped to preserve the Worker subrequest budget and no paid Google Shopping fallback is configured.`,
      )
      return retailers
    }

    const googleProvider = withFunctionalTraitEvidenceGuard(createGoogleShoppingArgentinaProvider({
      apiKey: googleShoppingApiKey,
      fetchImpl: options.fetchImpl,
    }))
    const google = await runArgentinaMarketBenchmark(productName, category, googleProvider)
    if (google.status === 'live') {
      google.warnings.unshift(
        `${evidenceSummary('Direct retailer discovery', retailers)}; Google Shopping Argentina fallback produced the functional benchmark. Mercado Libre discovery was skipped to preserve the Worker subrequest budget.`,
      )
      return google
    }

    const chosen = chooseNonLive(retailers, google)
    chosen.warnings.push(
      `Functional market evidence did not reach the live floor. ${evidenceSummary('Direct retailers', retailers)}; ${evidenceSummary('Google Shopping', google)}. Mercado Libre discovery was skipped to preserve the Worker subrequest budget.`,
    )
    return chosen
  }

  const primary = await analyzeArgentinaMarket(productName, category, {
    accessToken,
    fetchImpl: options.fetchImpl,
    salePriceLookupLimit: options.salePriceLookupLimit,
  })

  if (primary.status === 'live') return primary

  const retailers = await analyzeDirectRetailers(productName, category, options)

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
