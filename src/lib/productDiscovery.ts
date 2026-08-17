export type DiscoveryConstraints = {
  maxUnitPriceUsd: number | null
  maxMoq: number | null
  originCountry: string | null
  lowMoqPreference: boolean
}

export type ProductDiscoveryItem = {
  title: string
  url: string
  evidence: 'live'
  titleMatch: 'strong' | 'partial' | 'weak'
  matchedTerms: string[]
}

export type ProductDiscoveryResponse = {
  status: 'live' | 'unavailable'
  mode: 'direct' | 'browser' | 'unavailable'
  query: string
  results: ProductDiscoveryItem[]
  browserAttempted: boolean
  browserMsUsed: number | null
  note: string
  constraints: DiscoveryConstraints
  constraintsNote: string
}

export async function discoverProducts(query: string, userText: string = query): Promise<ProductDiscoveryResponse> {
  const response = await fetch('/api/discover', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, userText }),
  })
  const data = await response.json() as ProductDiscoveryResponse & { error?: string }
  if (!response.ok) throw new Error(data.error || 'No pudimos buscar productos en Alibaba.')
  return data
}
