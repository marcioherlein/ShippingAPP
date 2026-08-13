export type MlResult = {
  id?: string
  title?: string
  price?: number
  currency_id?: string
  condition?: string
  catalog_product_id?: string | null
  seller?: { id?: number }
  permalink?: string
}

export type MlSearch = { paging?: { total?: number }; results?: MlResult[] }

export type MarketComparable = {
  id: string
  title: string
  priceArs: number
  score: number
  reason: string
  permalink?: string
}

export type ArgentinaMarketResult = {
  status: 'live' | 'unavailable' | 'insufficient'
  query: string
  rawCount: number
  comparableCount: number
  p25Ars: number | null
  medianArs: number | null
  p75Ars: number | null
  suggestedPriceArs: number | null
  confidence: number
  source: string
  priceQuality: 'listed_search_price'
  comparables: MarketComparable[]
  warnings: string[]
}
