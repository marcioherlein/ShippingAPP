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
    if (!current || row.score > current.score) best.set(row.quantity, row)
  }
  return [...best.values()].sort((a, b) => a.quantity - b.quantity)
}

export function recommend(results: Result[]) {
  return [...results].sort((a, b) => {
    if (a.affordable !== b.affordable) return a.affordable ? -1 : 1
    return b.score - a.score || a.landedTotalUsd - b.landedTotalUsd
  })[0]
}
