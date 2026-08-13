import type { PriceTier } from './types'

export function unitPriceFor(quantity: number, tiers: PriceTier[]) {
  const sorted = [...tiers]
    .filter((tier) => tier.minQuantity > 0 && tier.unitPriceUsd > 0)
    .sort((a, b) => a.minQuantity - b.minQuantity)

  if (!sorted.length) return 0

  let price = sorted[0].unitPriceUsd
  for (const tier of sorted) {
    if (quantity >= tier.minQuantity) price = tier.unitPriceUsd
  }
  return price
}
