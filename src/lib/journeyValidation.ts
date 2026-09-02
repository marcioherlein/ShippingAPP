export type JourneyBudgetMode = 'budget' | 'units' | 'unknown' | null

type JourneyBudgetInput = {
  mode: JourneyBudgetMode
  budgetUsd: number
  unitsMin: number
  unitsMax: number
}

export function getJourneyBudgetError({ mode, budgetUsd, unitsMin, unitsMax }: JourneyBudgetInput): string | null {
  if (mode === null || mode === 'unknown') return null

  if (mode === 'budget') {
    if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
      return 'Ingresá un presupuesto mayor a USD 0 para continuar.'
    }
    return null
  }

  if (!Number.isFinite(unitsMin) || !Number.isFinite(unitsMax) || unitsMin <= 0 || unitsMax <= 0) {
    return 'El rango tiene que usar cantidades mayores a 0.'
  }

  if (!Number.isInteger(unitsMin) || !Number.isInteger(unitsMax)) {
    return 'Las cantidades del rango tienen que ser números enteros.'
  }

  if (unitsMin > unitsMax) {
    return 'La cantidad “Desde” no puede ser mayor que la cantidad “Hasta”.'
  }

  return null
}
