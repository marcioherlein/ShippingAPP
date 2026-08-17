import type { ProductAnalysisV2 } from './productAnalysisV2'
import type { DiscoveryConstraints } from './productDiscovery'

export type ConstraintCheck = {
  id: 'price' | 'moq' | 'origin' | 'low_moq'
  label: string
  status: 'pass' | 'fail' | 'pending'
  detail: string
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
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
    const actual = analysis.product.originCountry?.trim()
    checks.push(actual ? {
      id: 'origin', label: `Origen ${constraints.originCountry}`,
      status: normalize(actual) === normalize(constraints.originCountry) ? 'pass' : 'fail',
      detail: `Origen estructurado del producto: ${actual}.`,
    } : {
      id: 'origin', label: `Origen ${constraints.originCountry}`, status: 'pending',
      detail: 'El país de origen no quedó verificado en la publicación.',
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
