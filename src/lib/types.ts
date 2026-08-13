export type FreightMode = 'air' | 'sea'

export type PriceTier = {
  minQuantity: number
  unitPriceUsd: number
}

export type Inputs = {
  quantities: number[]
  priceTiers: PriceTier[]
  weightKg: number
  volumeCbm: number
  airUsdKg: number
  airMinimumUsd: number
  seaUsdCbm: number
  seaMinimumUsd: number
  fixedFeesUsd: number
  insurancePct: number
  importChargesPct: number
  marketPriceArs: number
  usdArs: number
  monthlyDemand: number
  capitalAvailableUsd: number
}

export type Result = {
  quantity: number
  mode: FreightMode
  supplierUnitUsd: number
  freightUsd: number
  landedTotalUsd: number
  landedUnitUsd: number
  marginPct: number
  inventoryMonths: number
  breakEvenArs: number
  score: number
  affordable: boolean
}
