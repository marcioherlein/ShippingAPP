import type { Inputs } from '../lib/types'

export const demoInputs: Inputs = {
  quantities: [100, 200, 300, 500, 1000],
  priceTiers: [
    { minQuantity: 100, unitPriceUsd: 12.5 },
    { minQuantity: 300, unitPriceUsd: 11.8 },
    { minQuantity: 500, unitPriceUsd: 11.2 },
    { minQuantity: 1000, unitPriceUsd: 10.5 },
  ],
  weightKg: 0.65,
  volumeCbm: 0.006,
  airUsdKg: 6.5,
  airMinimumUsd: 120,
  seaUsdCbm: 150,
  seaMinimumUsd: 250,
  fixedFeesUsd: 350,
  insurancePct: 1,
  importChargesPct: 25,
  marketPriceArs: 120000,
  usdArs: 1300,
  monthlyDemand: 40,
  capitalAvailableUsd: 6000,
}
