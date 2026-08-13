export type CustomsProfile = {
  ncmCandidate: string | null
  classificationConfidence: 'high' | 'medium' | 'low' | 'missing'
  dutyRatePct: number | null
  dutyRateStatus: 'candidate' | 'missing'
  statisticsRatePct: number
  statisticsExemptByOrigin: boolean | null
  interventionsStatus: 'verify_vuce'
  source: string
  reviewedAt: string
}

const REVIEWED_AT = '2026-08-13'

export function customsProfileFor(category: string | null | undefined, originCountry: string | null | undefined): CustomsProfile {
  const c = (category || '').toLowerCase()
  const origin = (originCountry || '').toLowerCase()
  const fromMercosur = ['argentina', 'brasil', 'brazil', 'paraguay', 'uruguay'].some((country) => origin.includes(country))
  const statisticsExemptByOrigin = origin ? fromMercosur : null

  if (c.includes('padel') || c.includes('pádel')) {
    return {
      ncmCandidate: '9506.59.00',
      classificationConfidence: 'medium',
      dutyRatePct: 20,
      dutyRateStatus: 'candidate',
      statisticsRatePct: 3,
      statisticsExemptByOrigin,
      interventionsStatus: 'verify_vuce',
      source: 'NCM 9506.59.00 — las demás raquetas similares. Verificar contra Arancel Integrado/CIVUCE vigente.',
      reviewedAt: REVIEWED_AT,
    }
  }

  return {
    ncmCandidate: null,
    classificationConfidence: 'missing',
    dutyRatePct: null,
    dutyRateStatus: 'missing',
    statisticsRatePct: 3,
    statisticsExemptByOrigin,
    interventionsStatus: 'verify_vuce',
    source: 'Clasificación arancelaria pendiente',
    reviewedAt: REVIEWED_AT,
  }
}
