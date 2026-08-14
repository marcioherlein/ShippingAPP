import { describe, expect, it } from 'vitest'
import { aggregateRobustCandidates, buildStressRuns, normalizeStress, selectRobustCandidate, type StressRun } from './robustOptimizer'
import { defaultInputs } from '../data/defaults'
import type { Result, ScenarioTaxContext } from './types'

const context: ScenarioTaxContext = {
  entityType: 'company', taxStatus: 'responsable_inscripto', purpose: 'resale',
  statisticsExempt: false, vatPerceptionExempt: false, gainsPerceptionExempt: false,
}

function fake(quantity: number, mode: 'air' | 'sea', score: number, marginPct: number, inventoryMonths: number, cashRequiredUsd: number, affordable = true): Result {
  return {
    quantity, mode, score, marginPct, inventoryMonths, cashRequiredUsd, affordable,
    supplierUnitUsd: 0, freightUsd: 0, insuranceUsd: 0, customsBaseUsd: 0, importDutyUsd: 0,
    statisticsFeeUsd: 0, importVatUsd: 0, vatPerceptionUsd: 0, gainsPerceptionUsd: 0,
    iibbPerceptionUsd: 0, cashTaxesUsd: 0, potentialCreditsUsd: 0, nonRecoverableTaxCostUsd: 0,
    economicLandedTotalUsd: 0, economicLandedUnitUsd: 0, cashRequiredUnitUsd: 0,
    landedTotalUsd: 0, landedUnitUsd: 0, breakEvenArs: 0, taxAssumptions: [],
  }
}

function run(id: StressRun['id'], results: Result[]): StressRun {
  return { id, label: id, inputs: defaultInputs, results }
}

describe('robust quantity optimizer adversarial rules', () => {
  it('clamps demand stress to a valid 0-100 range', () => {
    expect(normalizeStress(defaultInputs, { demandDownPct: 140, marketFloorArs: null }).demandDownPct).toBe(100)
    expect(normalizeStress(defaultInputs, { demandDownPct: -10, marketFloorArs: null }).demandDownPct).toBe(0)
  })

  it('treats a zero price floor as price-stress off', () => {
    const normalized = normalizeStress(defaultInputs, { demandDownPct: 0, marketFloorArs: 0 })
    expect(normalized.marketFloorArs).toBeNull()
    expect(buildStressRuns(defaultInputs, context, { demandDownPct: 0, marketFloorArs: 0 }).map((item) => item.id)).toEqual(['base'])
  })

  it('never lets a supposed price floor raise the base market price', () => {
    expect(normalizeStress(defaultInputs, { demandDownPct: 0, marketFloorArs: defaultInputs.marketPriceArs * 2 }).marketFloorArs).toBe(defaultInputs.marketPriceArs)
  })

  it('creates base, demand, price and combined cases when both downside inputs are active', () => {
    const runs = buildStressRuns(defaultInputs, context, { demandDownPct: 30, marketFloorArs: defaultInputs.marketPriceArs * 0.8 })
    expect(runs.map((item) => item.id)).toEqual(['base', 'demand_downside', 'price_floor', 'combined'])
  })

  it('does not create a fake price-downside case when the floor is at or above base', () => {
    const runs = buildStressRuns(defaultInputs, context, { demandDownPct: 30, marketFloorArs: defaultInputs.marketPriceArs * 1.2 })
    expect(runs.map((item) => item.id)).toEqual(['base', 'demand_downside'])
  })

  it('keeps cash required unchanged when only price and demand are stressed', () => {
    const runs = buildStressRuns(defaultInputs, context, { demandDownPct: 30, marketFloorArs: defaultInputs.marketPriceArs * 0.8 })
    const key = (result: Result) => `${result.quantity}:${result.mode}`
    const base = new Map(runs[0].results.map((result) => [key(result), result.cashRequiredUsd]))
    for (const stressed of runs.slice(1)) for (const result of stressed.results) expect(result.cashRequiredUsd).toBeCloseTo(base.get(key(result))!)
  })

  it('sets robust score to the worst score and never above the base score', () => {
    const candidates = aggregateRobustCandidates([
      run('base', [fake(100, 'sea', 85, 0.4, 3, 3000)]),
      run('combined', [fake(100, 'sea', 55, 0.1, 7, 3000)]),
    ])
    expect(candidates[0].robustScore).toBe(55)
    expect(candidates[0].robustScore).toBeLessThanOrEqual(candidates[0].baseScore)
    expect(candidates[0].worstMarginPct).toBe(0.1)
    expect(candidates[0].worstInventoryMonths).toBe(7)
  })

  it('fails closed when a candidate is missing from any stress case', () => {
    const candidates = aggregateRobustCandidates([
      run('base', [fake(100, 'sea', 80, 0.3, 3, 3000), fake(200, 'sea', 90, 0.4, 5, 5000)]),
      run('combined', [fake(100, 'sea', 60, 0.1, 6, 3000)]),
    ])
    expect(candidates.map((item) => item.quantity)).toEqual([100])
  })

  it('maximin prefers the better downside even when another candidate has a higher base score', () => {
    const candidates = aggregateRobustCandidates([
      run('base', [fake(100, 'sea', 78, 0.3, 3, 3000), fake(300, 'sea', 95, 0.5, 7, 5000)]),
      run('combined', [fake(100, 'sea', 70, 0.2, 5, 3000), fake(300, 'sea', 45, -0.05, 14, 5000)]),
    ])
    expect(selectRobustCandidate(candidates)?.quantity).toBe(100)
  })

  it('never chooses an unaffordable candidate while an affordable one exists', () => {
    const candidates = aggregateRobustCandidates([
      run('base', [fake(100, 'sea', 60, 0.2, 4, 3000, true), fake(300, 'sea', 95, 0.5, 8, 7000, false)]),
      run('combined', [fake(100, 'sea', 55, 0.1, 7, 3000, true), fake(300, 'sea', 90, 0.4, 15, 7000, false)]),
    ])
    expect(selectRobustCandidate(candidates)?.quantity).toBe(100)
  })

  it('when nothing is affordable, returns the lowest-cash candidate rather than the prettiest score', () => {
    const candidates = aggregateRobustCandidates([
      run('base', [fake(100, 'air', 50, 0.1, 3, 4000, false), fake(300, 'sea', 90, 0.4, 8, 6000, false)]),
      run('combined', [fake(100, 'air', 40, 0.0, 5, 4000, false), fake(300, 'sea', 80, 0.2, 12, 6000, false)]),
    ])
    expect(selectRobustCandidate(candidates)?.quantity).toBe(100)
  })
})
