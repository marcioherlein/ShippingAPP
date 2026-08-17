export type ProductDiscoveryItem = {
  title: string
  url: string
  evidence: 'live'
}

export type ProductDiscoveryResponse = {
  status: 'live' | 'unavailable'
  mode: 'direct' | 'browser' | 'unavailable'
  query: string
  results: ProductDiscoveryItem[]
  browserAttempted: boolean
  browserMsUsed: number | null
  note: string
}

export async function discoverProducts(query: string): Promise<ProductDiscoveryResponse> {
  const response = await fetch('/api/discover', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const data = await response.json() as ProductDiscoveryResponse & { error?: string }
  if (!response.ok) throw new Error(data.error || 'No pudimos buscar productos en Alibaba.')
  return data
}
