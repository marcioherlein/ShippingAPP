export type TechnicalRegulationScreening = 'no_specific_rt_detected' | 'known_applicable' | 'not_screened'

export type CustomsProfile = {
  ncmCandidate: string | null
  classificationConfidence: 'high' | 'medium' | 'low' | 'missing'
  dutyRatePct: number | null
  dutyRateStatus: 'candidate' | 'missing'
  statisticsRatePct: number
  statisticsPreferenceStatus: 'none' | 'verify_origin' | 'unknown'
  interventionsStatus: 'verify_vuce'
  technicalRegulationScreening: TechnicalRegulationScreening
  technicalRegulationEvidence: string
  source: string
  reviewedAt: string
}

const REVIEWED_AT = '2026-08-13'

export function customsProfileFor(category: string | null | undefined, originCountry: string | null | undefined): CustomsProfile {
  const c = (category || '').toLowerCase()
  const origin = (originCountry || '').toLowerCase()
  const mercosurOriginCandidate = ['argentina', 'brasil', 'brazil', 'paraguay', 'uruguay'].some((country) => origin.includes(country))
  const statisticsPreferenceStatus = !origin ? 'unknown' : mercosurOriginCandidate ? 'verify_origin' : 'none'
  const originNote = statisticsPreferenceStatus === 'verify_origin'
    ? ' Posible tratamiento por origen: verificar reglas y prueba de origen antes de aplicar preferencia o exención.'
    : ''

  if (c.includes('padel') || c.includes('pádel')) {
    return {
      ncmCandidate: '9506.59.00',
      classificationConfidence: 'medium',
      dutyRatePct: 20,
      dutyRateStatus: 'candidate',
      statisticsRatePct: 3,
      statisticsPreferenceStatus,
      interventionsStatus: 'verify_vuce',
      technicalRegulationScreening: 'no_specific_rt_detected',
      technicalRegulationEvidence: 'Screening oficial 13/08/2026: la familia de paletas/raquetas de pádel no aparece entre los productos enumerados por el régimen de productos de consumo de la Res. SIC 313/2025. Mantener verificación VUCE/CIVUCE por posición y producto antes de ejecutar.',
      source: `NCM 9506.59.00 — las demás raquetas similares. Verificar contra Arancel Integrado/CIVUCE vigente.${originNote}`,
      reviewedAt: REVIEWED_AT,
    }
  }

  return {
    ncmCandidate: null,
    classificationConfidence: 'missing',
    dutyRatePct: null,
    dutyRateStatus: 'missing',
    statisticsRatePct: 3,
    statisticsPreferenceStatus,
    interventionsStatus: 'verify_vuce',
    technicalRegulationScreening: 'not_screened',
    technicalRegulationEvidence: 'No existe todavía un screening técnico específico soportado para esta categoría.',
    source: `Clasificación arancelaria pendiente.${originNote}`,
    reviewedAt: REVIEWED_AT,
  }
}
