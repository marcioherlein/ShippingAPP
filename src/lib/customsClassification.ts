import { classifyNcm, type NcmCandidate } from './ncmClassifier'
import type { NcmSimOpening } from './ncmCatalog'

export type SimEvidenceConfidence = 'high' | 'medium' | 'low' | 'missing'

export type NcmTariffProfile = {
  aecPct: number
  diePct: number
  tePct: number
  diiPct: number
  vatPct: number
  vatAdditionalPct: number
  gainsPct: number
  iibbPct: number
  internalTax: string | number | null
  capitalGoodEligible: boolean
}

export type NcmDisambiguationQuestion = {
  id: string
  prompt: string
  attribute: 'material' | 'uso' | 'motor' | 'electrico' | 'construccion' | 'otro'
  options: Array<{ label: string; value: string; note?: string }>
}

export type NcmDisambiguationData = {
  candidates: Array<{ code: string; label: string; plainLabel: string; score: number }>
  questions: NcmDisambiguationQuestion[]
}

export type CustomsProfile = {
  ncmCandidate: string | null
  simOpeningCandidate?: NcmSimOpening | null
  simOpeningConfidence?: SimEvidenceConfidence
  simAlternatives?: NcmSimOpening[]
  simSource?: string
  classificationConfidence: 'high' | 'medium' | 'low' | 'missing'
  dutyRatePct: number | null
  dutyRateStatus: 'candidate' | 'missing'
  statisticsRatePct: number
  vatRatePct?: number
  vatAdditionalRatePct?: number
  gainsRatePct?: number
  iibbRatePct?: number
  capitalGoodEligible?: boolean
  tariff?: NcmTariffProfile | null
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
  // Best-effort sibling fields (additive). Never substitute for a confirmed classification:
  // dutyRatePct/dutyRateStatus/classificationConfidence stay fail-closed. These let the UI
  // proceed with a clearly-labeled conservative estimate instead of dead-ending.
  provisional?: boolean
  provisionalDutyRatePct?: number | null
  provisionalTariff?: NcmTariffProfile | null
  provisionalCode?: string | null
  provisionalLabel?: string | null
  provisionalBasis?: string | null
  disambiguation?: NcmDisambiguationData | null
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
    const confidenceAllowsEconomics = classification.confidence === 'high' || classification.confidence === 'medium'
    const usableDuty = confidenceAllowsEconomics ? classification.top.dutyRatePct : null
    const confidenceNote = confidenceAllowsEconomics
      ? ''
      : ' Confidence LOW: el candidato se muestra para investigación, pero su derecho no alimenta economics hasta validación/override.'

    return {
      ncmCandidate: classification.top.code,
      simOpeningCandidate: classification.top.simOpening,
      simOpeningConfidence: classification.top.simOpening ? classification.confidence : 'missing',
      simAlternatives: [],
      simSource: classification.top.simOpening ? 'Seed especializado ARCA 95.06' : 'SIM pendiente',
      classificationConfidence: classification.confidence,
      dutyRatePct: usableDuty,
      dutyRateStatus: usableDuty === null ? 'missing' : 'candidate',
      statisticsRatePct: 3,
      vatRatePct: 21,
      vatAdditionalRatePct: 20,
      gainsRatePct: 6,
      iibbRatePct: 2.5,
      capitalGoodEligible: false,
      tariff: null,
      statisticsPreferenceStatus,
      interventionsStatus: 'verify_vuce',
      source: `${classification.catalog.sourceLabel}. Catálogo seed parcial; NCM ${classification.top.code} candidata, no dictamen.${classification.top.simOpening ? ` Apertura SIM candidata ${classification.top.simOpening.code}.` : ''}${confidenceNote} Verificar Arancel Integrado/CIVUCE vigente.${originNote}`,
      reviewedAt: REVIEWED_AT,
      description: classification.top.description,
      alternatives: classification.alternatives,
      missingFacts: classification.missingFacts,
      rationale: classification.rationale,
      catalogScope: classification.catalog.coverage,
      catalogSourceDate: classification.catalog.sourceObservedAt,
      // When confidence is LOW the seed duty does not alimentar economics (usableDuty is null
      // above), but it is a legitimate conservative estimate — carry it so the UI can proceed
      // provisionally even fully offline. For high/medium the real duty is already applied.
      provisional: !confidenceAllowsEconomics && classification.top.dutyRatePct != null,
      provisionalDutyRatePct: confidenceAllowsEconomics ? null : classification.top.dutyRatePct,
      provisionalCode: confidenceAllowsEconomics ? null : classification.top.code,
      provisionalLabel: confidenceAllowsEconomics ? null : classification.top.description,
      provisionalBasis: confidenceAllowsEconomics || classification.top.dutyRatePct == null
        ? null
        : `Estimado del catálogo seed: derecho ${classification.top.dutyRatePct}% para la posición candidata ${classification.top.code}. Verificá antes de operar.`,
    }
  }

  return {
    ncmCandidate: null,
    simOpeningCandidate: null,
    simOpeningConfidence: 'missing',
    simAlternatives: [],
    simSource: 'SIM pendiente de NCM',
    classificationConfidence: 'missing',
    dutyRatePct: null,
    dutyRateStatus: 'missing',
    statisticsRatePct: 3,
    vatRatePct: 21,
    vatAdditionalRatePct: 20,
    gainsRatePct: 6,
    iibbRatePct: 2.5,
    capitalGoodEligible: false,
    tariff: null,
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
