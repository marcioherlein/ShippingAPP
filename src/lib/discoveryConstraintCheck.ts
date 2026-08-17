import type { ProductAnalysisV2 } from './productAnalysisV2'
import type { DiscoveryConstraints } from './productDiscovery'

export type ConstraintCheck = {
  id: 'price' | 'moq' | 'origin' | 'origin_excluded' | 'low_moq'
  label: string
  status: 'pass' | 'fail' | 'pending'
  detail: string
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function usableOrigin(value: string | undefined | null) {
  const actual = value?.trim()
  if (!actual) return null
  if (/\b(?:estimated|estimado|estimate|inferred|inferido|benchmark|assumed|supuesto)\b/i.test(normalize(actual))) return null
  return actual
}

export function checkDiscoveryConstraints(analysis: ProductAnalysisV2, constraints: DiscoveryConstraints): ConstraintCheck[] {
  const checks: ConstraintCheck[] = []

  if (constraints.maxUnitPriceUsd !== null) {
    const actual = analysis.product.unitPriceUsd
    checks.push(actual && actual > 0 ? {
      id: 'price', label: `Precio ≤ USD ${constraints.maxUnitPriceUsd}`,
      status: actual <= constraints.maxUnitPriceUsd ? 'pass' : 'fail',
      detail: `Publicación analizada: USD ${actual.toFixed(2)}.`,
    } : {
      id: 'price', label: `Precio ≤ USD ${constraints.maxUnitPriceUsd}`, status: 'pending',
      detail: 'La publicación no expuso un precio unitario verificable.',
    })
  }

  if (constraints.maxMoq !== null) {
    const actual = analysis.product.moq
    checks.push(actual && actual > 0 ? {
      id: 'moq', label: `MOQ ≤ ${constraints.maxMoq}`,
      status: actual <= constraints.maxMoq ? 'pass' : 'fail',
      detail: `Publicación analizada: MOQ ${actual} u.`,
    } : {
      id: 'moq', label: `MOQ ≤ ${constraints.maxMoq}`, status: 'pending',
      detail: 'La publicación no expuso un MOQ verificable.',
    })
  }

  if (constraints.originCountry) {
    const actual = usableOrigin(analysis.product.originCountry)
    checks.push(actual ? {
      id: 'origin', label: `Origen ${constraints.originCountry}`,
      status: normalize(actual) === normalize(constraints.originCountry) ? 'pass' : 'fail',
      detail: `Origen estructurado del producto: ${actual}.`,
    } : {
      id: 'origin', label: `Origen ${constraints.originCountry}`, status: 'pending',
      detail: 'El país de origen no quedó verificado de forma suficientemente limpia en la publicación.',
    })
  }

  for (const excluded of constraints.excludedOriginCountries) {
    const actual = usableOrigin(analysis.product.originCountry)
    checks.push(actual ? {
      id: 'origin_excluded', label: `Origen ≠ ${excluded}`,
      status: normalize(actual) !== normalize(excluded) ? 'pass' : 'fail',
      detail: `Origen estructurado del producto: ${actual}.`,
    } : {
      id: 'origin_excluded', label: `Origen ≠ ${excluded}`, status: 'pending',
      detail: 'El país de origen no quedó verificado de forma suficientemente limpia en la publicación.',
    })
  }

  if (constraints.lowMoqPreference && constraints.maxMoq === null) {
    checks.push({
      id: 'low_moq', label: 'Preferencia por MOQ bajo', status: 'pending',
      detail: analysis.product.moq
        ? `MOQ observado: ${analysis.product.moq} u. Falta un umbral explícito para decidir PASS/FAIL.`
        : 'Falta MOQ verificable y un umbral explícito para decidir PASS/FAIL.',
    })
  }

  return checks
}
