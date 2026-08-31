import { buildMarketQuery } from './catalogMatch'
import { runArgentinaMarketBenchmark } from './marketBenchmarkEngine'
import { createMercadoLibreMarketProviders } from './mercadoLibreMarketProvider'
import type { ArgentinaMarketResult } from './marketTypes'

type MercadoLibreMarketOptions = {
  accessToken?: string | null
  fetchImpl?: typeof fetch
  salePriceLookupLimit?: number
}

function configurationRequired(query: string): ArgentinaMarketResult {
  return {
    status: 'configuration_required',
    query,
    categoryId: null,
    categoryName: null,
    rawCount: 0,
    comparableCount: 0,
    effectivePriceCount: 0,
    p25Ars: null,
    medianArs: null,
    p75Ars: null,
    suggestedPriceArs: null,
    confidence: 0,
    source: 'Mercado Libre Argentina API · authentication required',
    priceQuality: 'listed_search_price',
    comparables: [],
    warnings: [
      'Demand is not inferred from public available quantity.',
      'Search prices are used only as per-listing fallback when effective sale_price cannot be resolved.',
      'Mercado Libre authentication is not configured. Set MERCADOLIBRE_ACCESS_TOKEN as a Worker secret; no unauthenticated market price is promoted into economics.',
    ],
  }
}

export async function analyzeArgentinaMarket(
  productName: string,
  category: string,
  options: MercadoLibreMarketOptions = {},
): Promise<ArgentinaMarketResult> {
  const query = buildMarketQuery(productName, category)
  const accessToken = options.accessToken?.trim()

  if (!accessToken) return configurationRequired(query)

  const { discoveryProvider, priceResolver } = createMercadoLibreMarketProviders({
    accessToken,
    fetchImpl: options.fetchImpl,
  })

  const result = await runArgentinaMarketBenchmark(productName, category, discoveryProvider, {
    priceResolver,
    priceLookupLimit: Math.max(0, Math.min(30, options.salePriceLookupLimit ?? 24)),
  })

  // Preserve the Mercado Libre-specific wording used by existing operational
  // diagnostics while the generic engine remains provider-agnostic.
  result.warnings = result.warnings.map((warning) =>
    warning.includes('use provider listing price because effective price was unavailable')
      ? warning.replace(
          'use provider listing price because effective price was unavailable',
          'use authenticated search price/listed price because effective sale_price was unavailable',
        )
      : warning,
  )

  return result
}
