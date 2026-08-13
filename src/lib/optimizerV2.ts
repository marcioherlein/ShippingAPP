import { scenario } from './scenario'
import type { Inputs, Result, ScenarioTaxContext } from './types'

export function calculateV2(inputs: Inputs, context: ScenarioTaxContext) {
  return inputs.quantities.flatMap((quantity) => [
    scenario(quantity, 'air', inputs, context),
    scenario(quantity, 'sea', inputs, context),
  ])
}

export function bestRowsV2(results: Result[]) {
  const best = new Map<number, Result>()
  for (const row of results) {
    const current = best.get(row.quantity)
    if (!current || row.score > current.score || (row.score === current.score && row.cashRequiredUsd < current.cashRequiredUsd)) best.set(row.quantity, row)
  }
  return [...best.values()].sort((a, b) => a.quantity - b.quantity)
}

export function recommendV2(results: Result[]) {
  const affordable = results.filter((row) => row.affordable)
  const pool = affordable.length ? affordable : results
  return [...pool].sort((a, b) => affordable.length
    ? b.score - a.score || a.cashRequiredUsd - b.cashRequiredUsd
    : a.cashRequiredUsd - b.cashRequiredUsd || b.score - a.score)[0]
}
