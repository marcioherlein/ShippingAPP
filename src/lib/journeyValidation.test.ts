import { describe, expect, it } from 'vitest'
import { getJourneyBudgetError } from './journeyValidation'

describe('journey budget validation', () => {
  it('accepts unknown mode without forcing a fake budget', () => {
    expect(getJourneyBudgetError({ mode: 'unknown', budgetUsd: 0, unitsMin: 0, unitsMax: 0 })).toBeNull()
  })

  it('requires a positive explicit budget', () => {
    expect(getJourneyBudgetError({ mode: 'budget', budgetUsd: 0, unitsMin: 50, unitsMax: 200 })).toMatch(/mayor a USD 0/)
    expect(getJourneyBudgetError({ mode: 'budget', budgetUsd: 10000, unitsMin: 50, unitsMax: 200 })).toBeNull()
  })

  it('requires positive whole-unit ranges', () => {
    expect(getJourneyBudgetError({ mode: 'units', budgetUsd: 0, unitsMin: 0, unitsMax: 20 })).toMatch(/mayores a 0/)
    expect(getJourneyBudgetError({ mode: 'units', budgetUsd: 0, unitsMin: 1.5, unitsMax: 20 })).toMatch(/números enteros/)
  })

  it('rejects reversed ranges', () => {
    expect(getJourneyBudgetError({ mode: 'units', budgetUsd: 0, unitsMin: 200, unitsMax: 50 })).toMatch(/no puede ser mayor/)
  })

  it('accepts a valid unit range', () => {
    expect(getJourneyBudgetError({ mode: 'units', budgetUsd: 0, unitsMin: 50, unitsMax: 200 })).toBeNull()
  })
})
