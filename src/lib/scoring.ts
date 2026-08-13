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
  const affordability = capitalAvailableUsd <= 0
    ? 10
    : clamp(capitalAvailableUsd / Math.max(1, landedTotalUsd)) * 10

  return Math.round(margin + efficiency + inventory + affordability)
}
