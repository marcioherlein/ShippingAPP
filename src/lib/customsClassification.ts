import { classifyNcm, type NcmCandidate } from './ncmClassifier'
import type { NcmSimOpening } from './ncmCatalog'

export type CustomsProfile = {
  ncmCandidate: string | null
  simOpeningCandidate?: NcmSimOpening | null
  classificationConfidence: 'high' | 'medium' | 'low' | 'missing'
  dutyRatePct: number | null
  dutyRateStatus: 'candidate' | 'missing'
  statisticsRatePct: number
  statisticsPreferenceStatus: 'none' | 'verify_origin' | 'unknown'
  interventionsStatus: 'verify_vuce'
  source: string
  reviewedAt: string
  description: string | null
  alternatives: NcmCandidate[]
  missingFacts: string[]
  rationale: string[]
  catalogScope: string
  catalogSourceDate: string
}

const REVIEWED_AT = '2026-08-14'

export function customsProfileFor(
  category: string | null | undefined,
  originCountry: string | null | undefined,
  productName?: string | null,
): CustomsProfile {
  const origin = (originCountry || '').toLowerCase()
  const mercosurOriginCandidate = ['argentina', 'brasil', 'brazil', 'paraguay', 'uruguay'].some((country) => origin.includes(country))
  const statisticsPreferenceStatus = !origin ? 'unknown' : mercosurOriginCandidate ? 'verify_origin' : 'none'
  const originNote = statisticsPreferenceStatus === 'verify_origin'
    ? ' Posible tratamiento por origen: verificar reglas y prueba de origen antes de aplicar preferencia o exención.'
    : ''

  const classification = classifyNcm({ name: productName, category })
  if (classification.status === 'candidate' && classification.top) {
    return {
      ncmCandidate: classification.top.code,
      simOpeningCandidate: classification.top.simOpening,
      classificationConfidence: classification.confidence,
      dutyRatePct: classification.top.dutyRatePct,
      dutyRateStatus: classification.top.dutyRatePct === null ? 'missing' : 'candidate',
      statisticsRatePct: 3,
      statisticsPreferenceStatus,
      interventionsStatus: 'verify_vuce',
      source: `${classification.catalog.sourceLabel}. Catálogo seed parcial; NCM ${classification.top.code} candidata, no dictamen.${classification.top.simOpening ? ` Apertura SIM candidata ${classification.top.simOpening.code}.` : ''} Verificar Arancel Integrado/CIVUCE vigente.${originNote}`,
      reviewedAt: REVIEWED_AT,
      description: classification.top.description,
      alternatives: classification.alternatives,
      missingFacts: classification.missingFacts,
      rationale: classification.rationale,
      catalogScope: classification.catalog.coverage,
      catalogSourceDate: classification.catalog.sourceObservedAt,
    }
  }

  return {
    ncmCandidate: null,
    simOpeningCandidate: null,
    classificationConfidence: 'missing',
    dutyRatePct: null,
    dutyRateStatus: 'missing',
    statisticsRatePct: 3,
    statisticsPreferenceStatus,
    interventionsStatus: 'verify_vuce',
    source: `Clasificación arancelaria pendiente. El producto está fuera de la cobertura suficiente del catálogo seed; no se inventa una NCM.${originNote}`,
    reviewedAt: REVIEWED_AT,
    description: null,
    alternatives: [],
    missingFacts: classification.missingFacts,
    rationale: classification.rationale,
    catalogScope: classification.catalog.coverage,
    catalogSourceDate: classification.catalog.sourceObservedAt,
  }
}
