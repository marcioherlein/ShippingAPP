import type { Inputs } from '../lib/types'

export const defaultInputs: Inputs = {
  quantities: [100, 200, 300, 500, 1000],
  priceTiers: [{ minQuantity: 100, unitPriceUsd: 12.5 }],
  weightKg: 0.65,
  volumeCbm: 0.006,
  airUsdKg: 6.5,
  airMinimumUsd: 120,
  seaUsdCbm: 150,
  seaMinimumUsd: 250,
  fixedFeesUsd: 350,
  insurancePct: 1,
  dutyRatePct: 20,
  dutyRateVerified: false,
  statisticsRatePct: 3,
  vatRatePct: 21,
  vatPerceptionPct: 20,
  gainsPerceptionPct: 6,
  iibbPerceptionPct: 0,
  marketPriceArs: 120000,
  usdArs: 1300,
  monthlyDemand: 40,
  // 0 means “not provided”. Capital is optional and must never be fabricated.
  capitalAvailableUsd: 0,
}
