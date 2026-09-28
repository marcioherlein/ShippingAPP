import { compareLandedCost, type LandedCostInput } from './landedCostEngine'
export function proposePurchase(input: Omit<LandedCostInput, 'quantity'>, budget: number, min = 1, max = 100000, pack = 1) {
  if (!(budget > 0) || !(input.unitPriceUsd > 0)) return null
  if (!Number.isInteger(pack) || pack < 1) return null
  let low = Math.max(1, Math.ceil(min / pack)), high = Math.floor(Math.min(max, budget / input.unitPriceUsd, 100000) / pack)
  let best: { quantity: number; totalUsd: number } | null = null
  for (let n = 0; low <= high && n < 20; n++) {
    const packs = Math.floor((low + high) / 2)
    const quantity = packs * pack
    const result = compareLandedCost({ ...input, quantity })
    const total = result.status === 'ok' && result.bestMode ? result.modes[result.bestMode].totalCostUsd : 0
    if (total > 0 && total <= budget) { best = { quantity, totalUsd: total }; low = packs + 1 }
    else high = packs - 1
  }
  return best
}
