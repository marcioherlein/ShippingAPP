import type { ProductDiscoveryItem } from './productDiscovery'

export type DiscoverySearchContext = {
  budgetUsd?: number | null
  unitsMin?: number | null
  unitsMax?: number | null
}

export type DiscoveryFit = 'possible' | 'impossible' | 'unknown' | 'not_applicable'

export type ContextualProductDiscoveryItem = ProductDiscoveryItem & {
  minimumFobUsd: number | null
  budgetFit: DiscoveryFit
  unitRangeFit: DiscoveryFit
  searchContextFit: DiscoveryFit
}

export type DiscoveryContextResult = {
  results: ContextualProductDiscoveryItem[]
  budgetRejectedCount: number
  unitRangeRejectedCount: number
  rejectedCount: number
  unknownFitCount: number
  contextNote: string | null
}

function positive(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export function normalizeDiscoverySearchContext(raw: DiscoverySearchContext = {}) {
  const budgetUsd = positive(raw.budgetUsd)
  const unitsMin = positive(raw.unitsMin)
  const unitsMax = positive(raw.unitsMax)
  const roundedMin = unitsMin ? Math.max(1, Math.round(unitsMin)) : null
  const roundedMax = unitsMax ? Math.max(1, Math.round(unitsMax)) : null

  if (roundedMin && roundedMax && roundedMin > roundedMax) {
    return { budgetUsd, unitsMin: roundedMax, unitsMax: roundedMin }
  }
  return { budgetUsd, unitsMin: roundedMin, unitsMax: roundedMax }
}

function getBudgetFit(item: ProductDiscoveryItem, budgetUsd: number | null) {
  if (!budgetUsd) return { fit: 'not_applicable' as const, minimumFobUsd: null }
  const price = positive(item.unitPriceUsd)
  const moq = positive(item.moq)
  if (!price || !moq) return { fit: 'unknown' as const, minimumFobUsd: null }
  const minimumFobUsd = Number((price * moq).toFixed(2))
  return {
    fit: minimumFobUsd > budgetUsd ? 'impossible' as const : 'possible' as const,
    minimumFobUsd,
  }
}

function getUnitRangeFit(item: ProductDiscoveryItem, unitsMin: number | null, unitsMax: number | null): DiscoveryFit {
  if (!unitsMin && !unitsMax) return 'not_applicable'
  const moq = positive(item.moq)
  if (!moq) return 'unknown'
  if (unitsMax && moq > unitsMax) return 'impossible'
  return 'possible'
}

function combineFits(budget: DiscoveryFit, units: DiscoveryFit): DiscoveryFit {
  const active = [budget, units].filter((fit) => fit !== 'not_applicable')
  if (!active.length) return 'not_applicable'
  if (active.includes('impossible')) return 'impossible'
  if (active.includes('unknown')) return 'unknown'
  return 'possible'
}

function buildContextNote(
  context: ReturnType<typeof normalizeDiscoverySearchContext>,
  rejectedCount: number,
  unknownFitCount: number,
) {
  const parts: string[] = []
  if (context.budgetUsd) parts.push(`presupuesto total USD ${context.budgetUsd.toLocaleString('en-US')}`)
  if (context.unitsMin || context.unitsMax) {
    const range = context.unitsMin && context.unitsMax
      ? `${context.unitsMin}–${context.unitsMax} unidades`
      : context.unitsMax ? `hasta ${context.unitsMax} unidades` : `desde ${context.unitsMin} unidades`
    parts.push(`rango ${range}`)
  }
  if (!parts.length) return null

  const status = [
    rejectedCount ? `${rejectedCount} descartado${rejectedCount === 1 ? '' : 's'}` : null,
    unknownFitCount ? `${unknownFitCount} pendiente${unknownFitCount === 1 ? '' : 's'} por precio/MOQ` : null,
  ].filter(Boolean).join(' · ')

  return `Filtro previo: ${parts.join(' · ')}. MOQ × FOB es sólo el piso de compra, no el costo puesto${status ? `. ${status}` : ''}.`
}

export function applyDiscoverySearchContext(
  source: ProductDiscoveryItem[],
  rawContext: DiscoverySearchContext = {},
): DiscoveryContextResult {
  const context = normalizeDiscoverySearchContext(rawContext)
  const contextual = source.map<ContextualProductDiscoveryItem>((item) => {
    const budget = getBudgetFit(item, context.budgetUsd)
    const unitRangeFit = getUnitRangeFit(item, context.unitsMin, context.unitsMax)
    return {
      ...item,
      minimumFobUsd: budget.minimumFobUsd,
      budgetFit: budget.fit,
      unitRangeFit,
      searchContextFit: combineFits(budget.fit, unitRangeFit),
    }
  })

  const budgetRejectedCount = contextual.filter((item) => item.budgetFit === 'impossible').length
  const unitRangeRejectedCount = contextual.filter((item) => item.unitRangeFit === 'impossible').length
  const rejectedCount = contextual.filter((item) => item.searchContextFit === 'impossible').length
  const results = contextual
    .filter((item) => item.searchContextFit !== 'impossible')
    .sort((a, b) => {
      const fitScore = (fit: DiscoveryFit) => fit === 'possible' ? 0 : fit === 'unknown' ? 1 : 2
      return fitScore(a.searchContextFit) - fitScore(b.searchContextFit)
    })
  const unknownFitCount = results.filter((item) => item.searchContextFit === 'unknown').length

  return {
    results,
    budgetRejectedCount,
    unitRangeRejectedCount,
    rejectedCount,
    unknownFitCount,
    contextNote: buildContextNote(context, rejectedCount, unknownFitCount),
  }
}
