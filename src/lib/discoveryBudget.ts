import type { Inputs } from './types'

export const MAX_DISCOVERY_CAPITAL_USD = 1_000_000_000

export function validDiscoveryCapital(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_DISCOVERY_CAPITAL_USD
}

export function applyDiscoveryBudget(inputs: Inputs, capitalUsd: number | null | undefined): Inputs {
  if (!validDiscoveryCapital(capitalUsd)) return inputs
  return { ...inputs, capitalAvailableUsd: capitalUsd as number }
}
