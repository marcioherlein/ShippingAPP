export type MlAttribute = {
  id?: string
  name?: string
  value_id?: string | null
  value_name?: string | null
}

export type MlResult = {
  id?: string
  title?: string
  price?: number
  currency_id?: string
  condition?: string
  category_id?: string
  catalog_product_id?: string | null
  seller?: { id?: number }
  permalink?: string
  attributes?: MlAttribute[]
}

export type MlSearch = { paging?: { total?: number }; results?: MlResult[] }

export type MlDomainPrediction = {
  domain_id?: string
  domain_name?: string
  category_id?: string
  category_name?: string
  attributes?: MlAttribute[]
}

export type MlSalePrice = {
  price_id?: string
  amount?: number
  regular_amount?: number | null
  currency_id?: string
  reference_date?: string
}

export type MarketComparable = {
  id: string
  title: string
  priceArs: number
  listedPriceArs: number
  priceSource: 'sale_price' | 'search_price'
  score: number
  reason: string
  permalink?: string
  categoryId?: string
  catalogProductId?: string | null
}

export type ArgentinaMarketResult = {
  status: 'live' | 'unavailable' | 'insufficient' | 'configuration_required'
  query: string
  matchMode?: 'exact' | 'functional'
  categoryId: string | null
  categoryName: string | null
  rawCount: number
  comparableCount: number
  effectivePriceCount: number
  p25Ars: number | null
  medianArs: number | null
  p75Ars: number | null
  suggestedPriceArs: number | null
  confidence: number
  source: string
  priceQuality: 'effective_sale_price' | 'mixed_sale_and_search_price' | 'listed_search_price'
  comparables: MarketComparable[]
  warnings: string[]
}
