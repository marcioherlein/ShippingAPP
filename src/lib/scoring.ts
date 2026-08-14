const clamp = (value: number) => Math.min(1, Math.max(0, value))

export function opportunityScore(
  marginPct: number,
  capitalEfficiency: number,
  inventoryMonths: number,
  landedTotalUsd: number,
  capitalAvailableUsd: number,
) {
  const margin = clamp(marginPct / 0.6) * 40
  const efficiency = clamp(capitalEfficiency / 1.5) * 30
  const inventory = clamp(1 - Math.max(0, inventoryMonths - 3) / 15) * 20
  const core = margin + efficiency + inventory

  // Capital is optional. Missing capital must not earn the old automatic 10/10
  // affordability bonus. Instead, score only the observed 90-point economic
  // dimensions and normalize them back to 100. Once capital is supplied, the
  // full 100-point model is used and affordability can help or hurt ranking.
  if (capitalAvailableUsd <= 0) return Math.round((core / 90) * 100)

  const affordability = clamp(capitalAvailableUsd / Math.max(1, landedTotalUsd)) * 10
  return Math.round(core + affordability)
}
