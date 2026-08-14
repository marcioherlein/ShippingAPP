import type { ProductAnalysisV2 } from './productAnalysisV2'

export type AutomaticEvidenceField = 'precio proveedor' | 'MOQ' | 'peso embalado' | 'volumen embalado' | 'benchmark local' | 'USD/ARS BCRA' | 'NCM / derecho'

export function missingAutomaticEvidence(analysis: ProductAnalysisV2): AutomaticEvidenceField[] {
  const liveFx = analysis.fx?.status === 'live' && !!analysis.fx.arsPerUsd && analysis.fx.arsPerUsd > 0
  return [
    !analysis.product.unitPriceUsd || analysis.product.unitPriceUsd <= 0 ? 'precio proveedor' : null,
    !analysis.product.moq || analysis.product.moq <= 0 ? 'MOQ' : null,
    analysis.product.packedWeightKg <= 0 ? 'peso embalado' : null,
    analysis.product.volumeCbm <= 0 ? 'volumen embalado' : null,
    !analysis.market.estimatedPriceArs || analysis.market.estimatedPriceArs <= 0 ? 'benchmark local' : null,
    !liveFx ? 'USD/ARS BCRA' : null,
    analysis.customs.dutyRatePct === null ? 'NCM / derecho' : null,
  ].filter((value): value is AutomaticEvidenceField => value !== null)
}

export function automaticEvidenceReady(analysis: ProductAnalysisV2) {
  return missingAutomaticEvidence(analysis).length === 0
}

export function quantityDecisionReady(economicsReady: boolean, monthlyDemand: number) {
  return economicsReady && Number.isFinite(monthlyDemand) && monthlyDemand > 0
}
