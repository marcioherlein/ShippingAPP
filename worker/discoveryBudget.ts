import type { OpportunitySearchItem } from './parsebotOpportunity'

export type DiscoverySearchContext = {
  budgetUsd: number | null
  unitsMin: number | null
  unitsMax: number | null
}

export type DiscoveryFit = 'possible' | 'impossible' | 'unknown'

export type ContextualOpportunitySearchItem = OpportunitySearchItem & {
  minimumFobUsd: number | null
  budgetFit: DiscoveryFit | 'not_applicable'
  unitRangeFit: DiscoveryFit | 'not_applicable'
  searchContextFit: DiscoveryFit | 'not_applicable'
}

export type DiscoveryContextResult = {
  results: ContextualOpportunitySearchItem[]
  budgetRejectedCount: number
  unitRangeRejectedCount: number
  rejectedCount: number
  unknownFitCount: number
  contextNote: string | null
}

function positive(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export function normalizeDiscoverySearchContext(raw: unknown): DiscoverySearchContext {
  const value = raw && typeof raw === 'object' ? raw as any : {}
  const budgetUsd = positive(value.budgetUsd)
  const unitsMin = positive(value.unitsMin)
  const unitsMax = positive(value.unitsMax)
  const roundedMin = unitsMin ? Math.max(1, Math.round(unitsMin)) : null
  const roundedMax = unitsMax ? Math.max(1, Math.round(unitsMax)) : null

  if (roundedMin && roundedMax && roundedMin > roundedMax) {
    return { budgetUsd, unitsMin: roundedMax, unitsMax: roundedMin }
  }

  return { budgetUsd, unitsMin: roundedMin, unitsMax: roundedMax }
}

function budgetFit(item: OpportunitySearchItem, budgetUsd: number | null) {
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

function unitRangeFit(item: OpportunitySearchItem, unitsMin: number | null, unitsMax: number | null): DiscoveryFit | 'not_applicable' {
  if (!unitsMin && !unitsMax) return 'not_applicable'
  const moq = positive(item.moq)
  if (!moq) return 'unknown'
  if (unitsMax && moq > unitsMax) return 'impossible'
  return 'possible'
}

function combineFits(budget: DiscoveryFit | 'not_applicable', units: DiscoveryFit | 'not_applicable'): DiscoveryFit | 'not_applicable' {
  const active = [budget, units].filter((fit) => fit !== 'not_applicable') as DiscoveryFit[]
  if (!active.length) return 'not_applicable'
  if (active.includes('impossible')) return 'impossible'
  if (active.includes('unknown')) return 'unknown'
  return 'possible'
}

function contextNote(context: DiscoverySearchContext, rejectedCount: number, unknownFitCount: number) {
  const parts: string[] = []
  if (context.budgetUsd) parts.push(`presupuesto total USD ${context.budgetUsd.toLocaleString('en-US')}`)
  if (context.unitsMin || context.unitsMax) {
    const range = context.unitsMin && context.unitsMax
      ? `${context.unitsMin}–${context.unitsMax} unidades`
      : context.unitsMax ? `hasta ${context.unitsMax} unidades` : `desde ${context.unitsMin} unidades`
    parts.push(`rango ${range}`)
  }
  if (!parts.length) return null

  const suffix = [
    rejectedCount ? `${rejectedCount} candidato${rejectedCount === 1 ? '' : 's'} descartado${rejectedCount === 1 ? '' : 's'} por inviabilidad matemática` : null,
    unknownFitCount ? `${unknownFitCount} pendiente${unknownFitCount === 1 ? '' : 's'} por falta de precio o MOQ` : null,
  ].filter(Boolean).join(' · ')

  return `Filtro previo: ${parts.join(' · ')}. MOQ × FOB se usa sólo como piso; no confirma costo puesto${suffix ? `. ${suffix}` : ''}.`
}

export function applyDiscoverySearchContext(
  source: OpportunitySearchItem[],
  rawContext: unknown,
): DiscoveryContextResult {
  const context = normalizeDiscoverySearchContext(rawContext)
  const contextual = source.map<ContextualOpportunitySearchItem>((item) => {
    const budget = budgetFit(item, context.budgetUsd)
    const units = unitRangeFit(item, context.unitsMin, context.unitsMax)
    return {
      ...item,
      minimumFobUsd: budget.minimumFobUsd,
      budgetFit: budget.fit,
      unitRangeFit: units,
      searchContextFit: combineFits(budget.fit, units),
    }
  })

  const budgetRejectedCount = contextual.filter((item) => item.budgetFit === 'impossible').length
  const unitRangeRejectedCount = contextual.filter((item) => item.unitRangeFit === 'impossible').length
  const rejected = contextual.filter((item) => item.searchContextFit === 'impossible')
  const eligible = contextual
    .filter((item) => item.searchContextFit !== 'impossible')
    .sort((a, b) => {
      const fitScore = (item: ContextualOpportunitySearchItem) => item.searchContextFit === 'possible' ? 0 : item.searchContextFit === 'unknown' ? 1 : 2
      return fitScore(a) - fitScore(b)
    })
  const unknownFitCount = eligible.filter((item) => item.searchContextFit === 'unknown').length

  return {
    results: eligible,
    budgetRejectedCount,
    unitRangeRejectedCount,
    rejectedCount: rejected.length,
    unknownFitCount,
    contextNote: contextNote(context, rejected.length, unknownFitCount),
  }
}
