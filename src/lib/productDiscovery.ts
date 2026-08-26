export type DiscoveryConstraints = {
  maxUnitPriceUsd: number | null
  maxMoq: number | null
  originCountry: string | null
  excludedOriginCountries: string[]
  lowMoqPreference: boolean
}

export type ProductDiscoveryItem = {
  title: string
  url: string
  evidence?: 'live'
  titleMatch?: 'strong' | 'partial' | 'weak'
  matchedTerms?: string[]
  productId?: string | null
  imageUrl?: string | null
  unitPriceUsd?: number | null
  moq?: number | null
  priceDisplay?: string | null
  supplierName?: string | null
  supplierYears?: string | null
  supplierBadges?: string[]
  reviewCount?: number | null
  reviewScore?: number | null
  packedWeightKg?: number | null
  volumeCbm?: number | null
  opportunityScore?: number
  missingFacts?: string[]
  sellingPoints?: string[]
  nextAction?: 'analyze_product' | 'needs_supplier_data'
  source?: 'parsebot_search_products'
}

export type ProductDiscoveryResponse = {
  status: 'live' | 'unavailable' | 'not_configured'
  mode: 'direct' | 'browser' | 'parsebot' | 'unavailable'
  query: string
  results: ProductDiscoveryItem[]
  browserAttempted?: boolean
  browserMsUsed?: number | null
  note: string
  constraints: DiscoveryConstraints
  constraintsNote: string
  totalCount?: number | null
  totalPages?: number | null
  currentPage?: number
  creditsEstimated?: number
  warnings?: string[]
}

export async function discoverProducts(query: string, userText: string = query): Promise<ProductDiscoveryResponse> {
  const response = await fetch('/api/opportunity-search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, userText, limit: 12 }),
  })
  const data = await response.json() as ProductDiscoveryResponse & { error?: string }
  if (!response.ok) throw new Error(data.error || 'No pudimos buscar productos en Alibaba.')
  return data
}
