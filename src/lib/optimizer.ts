import { scenario } from './scenario'
import type { Inputs, Result } from './types'

export function calculate(inputs: Inputs) {
  return inputs.quantities.flatMap((quantity) => [
    scenario(quantity, 'air', inputs),
    scenario(quantity, 'sea', inputs),
  ])
}

export function bestPerQuantity(results: Result[]) {
  const best = new Map<number, Result>()
  for (const row of results) {
    const current = best.get(row.quantity)
    if (
      !current ||
      row.score > current.score ||
      (row.score === current.score && row.landedTotalUsd < current.landedTotalUsd)
    ) {
      best.set(row.quantity, row)
    }
  }
  return [...best.values()].sort((a, b) => a.quantity - b.quantity)
}

export function recommend(results: Result[]) {
  const affordable = results.filter((row) => row.affordable)
  if (affordable.length) {
    return [...affordable].sort((a, b) =>
      b.score - a.score || a.landedTotalUsd - b.landedTotalUsd
    )[0]
  }

  // If nothing fits the user's capital, do not call the highest score a recommendation.
  // Return the minimum-capital scenario so the UI can show the funding gap instead.
  return [...results].sort((a, b) =>
    a.landedTotalUsd - b.landedTotalUsd || b.score - a.score
  )[0]
}
