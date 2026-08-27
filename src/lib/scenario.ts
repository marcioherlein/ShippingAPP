import { airFreightV2, seaFreightV2 } from './freightV2'
import { calculateImportTaxes } from './importTaxes'
import { unitPriceFor } from './pricing'
import { opportunityScore } from './scoring'
import type { FreightMode, Inputs, Result, ScenarioTaxContext } from './types'

const unknownTaxContext: ScenarioTaxContext = {
  entityType: 'unknown', taxStatus: 'unknown', purpose: 'unknown',
  statisticsExempt: false, vatPerceptionExempt: false, gainsPerceptionExempt: false,
  capitalGoodEligible: false, capitalGoodUse: false,
}

export function scenario(quantity: number, mode: FreightMode, i: Inputs, taxContext: ScenarioTaxContext = unknownTaxContext): Result {
  const supplierUnitUsd = unitPriceFor(quantity, i.priceTiers)
  const goodsUsd = supplierUnitUsd * quantity
  const freight = mode === 'air'
    ? airFreightV2(quantity, i.weightKg, i.volumeCbm, i.airUsdKg, i.airMinimumUsd)
    : seaFreightV2(quantity, i.weightKg, i.volumeCbm, i.seaUsdCbm, i.seaMinimumUsd)
  const freightUsd = freight.costUsd
  const freightAssumption = mode === 'air'
    ? `Flete aéreo calculado sobre ${freight.chargeableUnits.toFixed(1)} kg cobrables (${freight.basis === 'volumetric_weight' ? 'peso volumétrico' : freight.basis === 'actual_weight' ? 'peso real' : 'cargo mínimo'}).`
    : `Flete LCL calculado sobre ${freight.chargeableUnits.toFixed(2)} W/M (${freight.basis === 'weight_measurement' ? 'peso' : freight.basis === 'volume' ? 'volumen' : 'cargo mínimo'}).`
  const insuranceUsd = (goodsUsd + freightUsd) * i.insurancePct / 100
  const customsBaseUsd = goodsUsd + freightUsd + insuranceUsd

  const taxes = calculateImportTaxes({
    customsBaseUsd,
    dutyRatePct: i.dutyRatePct,
    dutyRateVerified: i.dutyRateVerified,
    statisticsRatePct: i.statisticsRatePct,
    statisticsExempt: taxContext.statisticsExempt,
    vatRatePct: i.vatRatePct,
    vatPerceptionPct: i.vatPerceptionPct,
    gainsPerceptionPct: i.gainsPerceptionPct,
    iibbPerceptionPct: i.iibbPerceptionPct,
    taxStatus: taxContext.taxStatus,
    purpose: taxContext.purpose,
    entityType: taxContext.entityType,
    vatPerceptionExempt: taxContext.vatPerceptionExempt,
    gainsPerceptionExempt: taxContext.gainsPerceptionExempt,
    capitalGoodEligible: taxContext.capitalGoodEligible,
    capitalGoodUse: taxContext.capitalGoodUse,
  })

  const economicLandedTotalUsd = customsBaseUsd + taxes.nonRecoverableTaxCostUsd + i.fixedFeesUsd
  const economicLandedUnitUsd = economicLandedTotalUsd / quantity
  const cashRequiredUsd = customsBaseUsd + taxes.cashTaxesUsd + i.fixedFeesUsd
  const cashRequiredUnitUsd = cashRequiredUsd / quantity

  const marketGrossUsd = i.usdArs > 0 ? i.marketPriceArs / i.usdArs : 0
  const priceIsRetailGross = taxContext.taxStatus === 'responsable_inscripto' && taxContext.purpose === 'resale'
  const marketEconomicUsd = priceIsRetailGross && i.vatRatePct > 0 ? marketGrossUsd / (1 + i.vatRatePct / 100) : marketGrossUsd
  const saleAssumptions = priceIsRetailGross ? [`Precio local tratado como precio final con IVA incluido; para RI + reventa el margen usa venta neta de IVA (${i.vatRatePct}%).`] : []

  const marginPct = marketEconomicUsd > 0 ? (marketEconomicUsd - economicLandedUnitUsd) / marketEconomicUsd : 0
  const inventoryMonths = i.monthlyDemand > 0 ? quantity / i.monthlyDemand : 99
  const annualUnits = Math.min(quantity, Math.max(0, i.monthlyDemand * 12))
  const annualGrossProfit = Math.max(0, marketEconomicUsd - economicLandedUnitUsd) * annualUnits
  const capitalEfficiency = cashRequiredUsd > 0 ? annualGrossProfit / cashRequiredUsd : 0
  const affordable = i.capitalAvailableUsd <= 0 || cashRequiredUsd <= i.capitalAvailableUsd
  const score = opportunityScore(marginPct, capitalEfficiency, inventoryMonths, cashRequiredUsd, i.capitalAvailableUsd)

  return {
    quantity, mode, supplierUnitUsd, freightUsd, insuranceUsd, customsBaseUsd,
    importDutyUsd: taxes.importDutyUsd, statisticsFeeUsd: taxes.statisticsFeeUsd,
    importVatUsd: taxes.importVatUsd, vatPerceptionUsd: taxes.vatPerceptionUsd,
    gainsPerceptionUsd: taxes.gainsPerceptionUsd, iibbPerceptionUsd: taxes.iibbPerceptionUsd,
    cashTaxesUsd: taxes.cashTaxesUsd, potentialCreditsUsd: taxes.potentialCreditsUsd,
    nonRecoverableTaxCostUsd: taxes.nonRecoverableTaxCostUsd,
    economicLandedTotalUsd, economicLandedUnitUsd, cashRequiredUsd, cashRequiredUnitUsd,
    landedTotalUsd: economicLandedTotalUsd, landedUnitUsd: economicLandedUnitUsd,
    marginPct, inventoryMonths, breakEvenArs: economicLandedUnitUsd * i.usdArs,
    score, affordable, taxAssumptions: [freightAssumption, ...taxes.assumptions, ...saleAssumptions],
  }
}
