export type FreightBasis = 'actual_weight' | 'volumetric_weight' | 'volume' | 'weight_measurement' | 'minimum'

export type FreightCalculation = {
  costUsd: number
  actualWeightKg: number
  volumeCbm: number
  chargeableUnits: number
  unit: 'kg' | 'wm'
  basis: FreightBasis
}

export function airFreightV2(quantity: number, unitWeightKg: number, unitVolumeCbm: number, rateUsdKg: number, minimumUsd: number, volumetricKgPerCbm = 1000 / 6): FreightCalculation {
  const actualWeightKg = Math.max(0, quantity * unitWeightKg)
  const volumeCbm = Math.max(0, quantity * unitVolumeCbm)
  const volumetricWeightKg = volumeCbm * volumetricKgPerCbm
  const chargeableUnits = Math.max(actualWeightKg, volumetricWeightKg)
  const variableCost = chargeableUnits * Math.max(0, rateUsdKg)
  const costUsd = Math.max(Math.max(0, minimumUsd), variableCost)
  const basis: FreightBasis = minimumUsd > variableCost ? 'minimum' : volumetricWeightKg > actualWeightKg ? 'volumetric_weight' : 'actual_weight'
  return { costUsd, actualWeightKg, volumeCbm, chargeableUnits, unit: 'kg', basis }
}

export function seaFreightV2(quantity: number, unitWeightKg: number, unitVolumeCbm: number, rateUsdWm: number, minimumUsd: number, kgPerWm = 1000): FreightCalculation {
  const actualWeightKg = Math.max(0, quantity * unitWeightKg)
  const volumeCbm = Math.max(0, quantity * unitVolumeCbm)
  const weightMeasurement = kgPerWm > 0 ? actualWeightKg / kgPerWm : 0
  const chargeableUnits = Math.max(volumeCbm, weightMeasurement)
  const variableCost = chargeableUnits * Math.max(0, rateUsdWm)
  const costUsd = Math.max(Math.max(0, minimumUsd), variableCost)
  const basis: FreightBasis = minimumUsd > variableCost ? 'minimum' : weightMeasurement > volumeCbm ? 'weight_measurement' : 'volume'
  return { costUsd, actualWeightKg, volumeCbm, chargeableUnits, unit: 'wm', basis }
}
