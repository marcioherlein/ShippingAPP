import { scenario } from './scenario'
import { recommendV2 } from './optimizerV2'
import type { FreightMode, Inputs, Result, ScenarioTaxContext } from './types'

export type StressCase = 'base' | 'demand_downside' | 'price_floor' | 'combined'
export type RobustStress = { demandDownPct: number; marketFloorArs: number | null }
export type StressRun = { id: StressCase; label: string; inputs: Inputs; results: Result[] }

export type RobustCandidate = {
  quantity: number
  mode: FreightMode
  base: Result
  scenarioResults: { id: StressCase; result: Result }[]
  robustScore: number
  worstMarginPct: number
  worstInventoryMonths: number
  baseScore: number
  scoreDrop: number
  affordable: boolean
}

export type RobustOptimization = {
  stress: { demandDownPct: number; marketFloorArs: number | null }
  scenarios: StressRun[]
  baseRecommendation?: Result
  robustRecommendation?: RobustCandidate
  selectionChanges: boolean
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

export function normalizeStress(inputs: Inputs, stress: RobustStress) {
  const demandDownPct = clamp(stress.demandDownPct, 0, 100)
  const requestedFloor = stress.marketFloorArs && stress.marketFloorArs > 0 ? stress.marketFloorArs : null
  const marketFloorArs = requestedFloor === null ? null : Math.min(inputs.marketPriceArs, requestedFloor)
  return { demandDownPct, marketFloorArs }
}

function calculateCase(inputs: Inputs, context: ScenarioTaxContext) {
  return inputs.quantities.flatMap((quantity) => [scenario(quantity, 'air', inputs, context), scenario(quantity, 'sea', inputs, context)])
}

export function buildStressRuns(inputs: Inputs, context: ScenarioTaxContext, stress: RobustStress): StressRun[] {
  const normalized = normalizeStress(inputs, stress)
  const demandDown = normalized.demandDownPct > 0
  const priceDown = normalized.marketFloorArs !== null && normalized.marketFloorArs < inputs.marketPriceArs
  const runs: StressRun[] = [{ id: 'base', label: 'Base', inputs, results: calculateCase(inputs, context) }]

  if (demandDown) {
    const stressed = { ...inputs, monthlyDemand: inputs.monthlyDemand * (1 - normalized.demandDownPct / 100) }
    runs.push({ id: 'demand_downside', label: `Demanda -${normalized.demandDownPct}%`, inputs: stressed, results: calculateCase(stressed, context) })
  }
  if (priceDown) {
    const stressed = { ...inputs, marketPriceArs: normalized.marketFloorArs! }
    runs.push({ id: 'price_floor', label: 'Precio P25 / piso', inputs: stressed, results: calculateCase(stressed, context) })
  }
  if (demandDown && priceDown) {
    const stressed = { ...inputs, monthlyDemand: inputs.monthlyDemand * (1 - normalized.demandDownPct / 100), marketPriceArs: normalized.marketFloorArs! }
    runs.push({ id: 'combined', label: 'Precio + demanda adversos', inputs: stressed, results: calculateCase(stressed, context) })
  }
  return runs
}

function key(result: Pick<Result, 'quantity' | 'mode'>) {
  return `${result.quantity}:${result.mode}`
}

export function aggregateRobustCandidates(runs: StressRun[]): RobustCandidate[] {
  const base = runs.find((run) => run.id === 'base')
  if (!base || !runs.length) return []
  const maps = new Map(runs.map((run) => [run.id, new Map(run.results.map((result) => [key(result), result]))]))
  const candidates: RobustCandidate[] = []

  for (const baseResult of base.results) {
    const k = key(baseResult)
    const scenarioResults = runs.map((run) => ({ id: run.id, result: maps.get(run.id)?.get(k) })).filter((item): item is { id: StressCase; result: Result } => !!item.result)
    if (scenarioResults.length !== runs.length) continue
    const scores = scenarioResults.map((item) => item.result.score)
    candidates.push({
      quantity: baseResult.quantity,
      mode: baseResult.mode,
      base: baseResult,
      scenarioResults,
      robustScore: Math.min(...scores),
      worstMarginPct: Math.min(...scenarioResults.map((item) => item.result.marginPct)),
      worstInventoryMonths: Math.max(...scenarioResults.map((item) => item.result.inventoryMonths)),
      baseScore: baseResult.score,
      scoreDrop: baseResult.score - Math.min(...scores),
      affordable: scenarioResults.every((item) => item.result.affordable),
    })
  }
  return candidates
}

export function selectRobustCandidate(candidates: RobustCandidate[]) {
  const affordable = candidates.filter((candidate) => candidate.affordable)
  const pool = affordable.length ? affordable : candidates
  return [...pool].sort((a, b) => affordable.length
    ? b.robustScore - a.robustScore || b.worstMarginPct - a.worstMarginPct || a.base.cashRequiredUsd - b.base.cashRequiredUsd
    : a.base.cashRequiredUsd - b.base.cashRequiredUsd || b.robustScore - a.robustScore)[0]
}

export function optimizeRobust(inputs: Inputs, context: ScenarioTaxContext, stress: RobustStress): RobustOptimization {
  const normalized = normalizeStress(inputs, stress)
  const scenarios = buildStressRuns(inputs, context, normalized)
  const base = scenarios.find((run) => run.id === 'base')
  const baseRecommendation = base ? recommendV2(base.results) : undefined
  const robustRecommendation = selectRobustCandidate(aggregateRobustCandidates(scenarios))
  const selectionChanges = !!baseRecommendation && !!robustRecommendation && (baseRecommendation.quantity !== robustRecommendation.quantity || baseRecommendation.mode !== robustRecommendation.mode)
  return { stress: normalized, scenarios, baseRecommendation, robustRecommendation, selectionChanges }
}
