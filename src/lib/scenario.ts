import { airFreight, seaFreight } from './freight'
import { unitPriceFor } from './pricing'
import { opportunityScore } from './scoring'
import type { FreightMode, Inputs, Result } from './types'

export function scenario(quantity: number, mode: FreightMode, i: Inputs): Result {
  const supplierUnitUsd = unitPriceFor(quantity, i.priceTiers)
  const goodsUsd = supplierUnitUsd * quantity
  const freightUsd = mode === 'air'
    ? airFreight(quantity, i.weightKg, i.airUsdKg, i.airMinimumUsd)
    : seaFreight(quantity, i.volumeCbm, i.seaUsdCbm, i.seaMinimumUsd)
  const insuranceUsd = (goodsUsd + freightUsd) * i.insurancePct / 100
  const customsBaseUsd = goodsUsd + freightUsd + insuranceUsd
  const chargesUsd = customsBaseUsd * i.importChargesPct / 100
  const landedTotalUsd = customsBaseUsd + chargesUsd + i.fixedFeesUsd
  const landedUnitUsd = landedTotalUsd / quantity
  const marketUsd = i.usdArs > 0 ? i.marketPriceArs / i.usdArs : 0
  const marginPct = marketUsd > 0 ? (marketUsd - landedUnitUsd) / marketUsd : 0
  const inventoryMonths = i.monthlyDemand > 0 ? quantity / i.monthlyDemand : 99
  const annualUnits = Math.min(quantity, Math.max(0, i.monthlyDemand * 12))
  const annualGrossProfit = Math.max(0, marketUsd - landedUnitUsd) * annualUnits
  const capitalEfficiency = landedTotalUsd > 0 ? annualGrossProfit / landedTotalUsd : 0
  const affordable = i.capitalAvailableUsd <= 0 || landedTotalUsd <= i.capitalAvailableUsd
  const score = opportunityScore(marginPct, capitalEfficiency, inventoryMonths, landedTotalUsd, i.capitalAvailableUsd)

  return {
    quantity, mode, supplierUnitUsd, freightUsd, landedTotalUsd, landedUnitUsd,
    marginPct, inventoryMonths, breakEvenArs: landedUnitUsd * i.usdArs, score, affordable,
  }
}
