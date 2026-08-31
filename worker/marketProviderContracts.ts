import type { MlAttribute } from './marketTypes'

export type ArgentinaMarketCandidate = {
  id: string
  title: string
  priceArs: number
  condition?: string
  categoryId?: string
  catalogProductId?: string | null
  sellerKey?: string
  permalink?: string
  attributes?: MlAttribute[]
}

export type ArgentinaMarketCategoryHint = {
  categoryId?: string | null
  categoryName?: string | null
  attributes?: MlAttribute[]
}

export type ArgentinaMarketDiscoveryContext = {
  query: string
  productName: string
  category: string
}

export type ArgentinaMarketDiscoveryResult = {
  providerId: string
  sourceLabel: string
  candidates: ArgentinaMarketCandidate[]
  categoryHint?: ArgentinaMarketCategoryHint | null
  warnings?: string[]
}

export interface ArgentinaMarketDiscoveryProvider {
  id: string
  discover(context: ArgentinaMarketDiscoveryContext): Promise<ArgentinaMarketDiscoveryResult>
}

export type ArgentinaMarketResolvedPrice = {
  priceArs: number
  effective: boolean
  sourceLabel: string
}

export interface ArgentinaMarketPriceResolver {
  id: string
  resolve(candidate: ArgentinaMarketCandidate): Promise<ArgentinaMarketResolvedPrice | null>
}
