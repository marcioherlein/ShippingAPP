export type FreightMode = 'air' | 'sea'

export type PriceTier = {
  minQuantity: number
  unitPriceUsd: number
}

export type ScenarioTaxContext = {
  entityType: 'company' | 'individual' | 'unknown'
  taxStatus: 'responsable_inscripto' | 'monotributo' | 'exento' | 'unknown'
  purpose: 'resale' | 'own_use' | 'unknown'
  statisticsExempt: boolean
  vatPerceptionExempt: boolean
  gainsPerceptionExempt: boolean
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
  dutyRatePct: number
  dutyRateVerified: boolean
  statisticsRatePct: number
  vatRatePct: number
  vatPerceptionPct: number
  gainsPerceptionPct: number
  iibbPerceptionPct: number
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
  insuranceUsd: number
  customsBaseUsd: number
  importDutyUsd: number
  statisticsFeeUsd: number
  importVatUsd: number
  vatPerceptionUsd: number
  gainsPerceptionUsd: number
  iibbPerceptionUsd: number
  cashTaxesUsd: number
  potentialCreditsUsd: number
  nonRecoverableTaxCostUsd: number
  economicLandedTotalUsd: number
  economicLandedUnitUsd: number
  cashRequiredUsd: number
  cashRequiredUnitUsd: number
  landedTotalUsd: number
  landedUnitUsd: number
  marginPct: number
  inventoryMonths: number
  breakEvenArs: number
  score: number
  affordable: boolean
  taxAssumptions: string[]
}
