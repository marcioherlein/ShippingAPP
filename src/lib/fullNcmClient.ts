import type { CustomsProfile } from './customsClassification'
import type { NcmCandidate } from './ncmClassifier'

export type FullNcmApiResult = {
  status: 'candidate' | 'missing'
  code: string | null
  label: string | null
  confidence: 'high' | 'medium' | 'low' | 'missing'
  alternatives: Array<{ code: string; label: string; score: number }>
  missingFacts: string[]
  rationale: string[]
  searchTerms: string[]
  sourceDate: string
  source: string
  catalogRecordCount: number
  retrievalMode: 'ai_reranked' | 'deterministic_fallback' | 'missing'
}

export type FullNcmFacts = {
  name?: string | null
  category?: string | null
  material?: string | null
  functionText?: string | null
  description?: string | null
}

function strong(confidence: CustomsProfile['classificationConfidence'] | FullNcmApiResult['confidence']) {
  return confidence === 'high' || confidence === 'medium'
}

function apiAlternatives(result: FullNcmApiResult): NcmCandidate[] {
  return result.alternatives.map((candidate) => ({
    code: candidate.code,
    description: candidate.label,
    dutyRatePct: null,
    score: candidate.score,
    reasons: ['Candidato de la shortlist full-catalog ARCA.'],
    simOpening: null,
  }))
}

function addUniqueAlternative(items: NcmCandidate[], candidate: NcmCandidate | null) {
  if (!candidate || items.some((item) => item.code === candidate.code)) return items
  return [...items, candidate]
}

export function mergeFullCustomsProfile(local: CustomsProfile, full: FullNcmApiResult): CustomsProfile {
  if (full.status !== 'candidate' || !full.code || !full.label) {
    return {
      ...local,
      source: `${local.source} Full-catalog retrieval no produjo candidato suficiente; se conserva el clasificador seed sin ampliar certeza.`,
      rationale: [...local.rationale, ...full.rationale],
      catalogScope: `${local.catalogScope} · Full ARCA snapshot consulted: ${full.catalogRecordCount} records`,
      catalogSourceDate: full.sourceDate || local.catalogSourceDate,
    }
  }

  const localStrong = !!local.ncmCandidate && strong(local.classificationConfidence)
  const fullStrong = strong(full.confidence)

  if (localStrong && fullStrong && local.ncmCandidate !== full.code) {
    const conflictAlternative: NcmCandidate = {
      code: full.code, description: full.label, dutyRatePct: null, score: 0,
      reasons: ['Conflicto entre clasificador seed especializado y retrieval full-catalog.'], simOpening: null,
    }
    return {
      ...local,
      classificationConfidence: 'low', dutyRatePct: null, dutyRateStatus: 'missing', simOpeningCandidate: null,
      alternatives: addUniqueAlternative([...local.alternatives], conflictAlternative).slice(0, 4),
      missingFacts: [...new Set([...local.missingFacts, ...full.missingFacts, 'Resolver conflicto entre candidatos NCM antes de usar aranceles'])],
      rationale: [...local.rationale, ...full.rationale, `CONFLICTO: seed ${local.ncmCandidate} vs full-catalog ${full.code}. Economics bloqueado.`],
      source: `${full.source} · Conflicto de clasificación: seed ${local.ncmCandidate} vs full-catalog ${full.code}. No se usa derecho hasta validación.`,
      catalogScope: `Full ARCA snapshot (${full.catalogRecordCount} NCM) + seed especializado`,
      catalogSourceDate: full.sourceDate,
      reviewedAt: full.sourceDate,
    }
  }

  if (localStrong && (!fullStrong || local.ncmCandidate !== full.code)) {
    return {
      ...local,
      source: `${local.source} Full-catalog devolvió ${full.code} con confidence ${full.confidence}; no desplaza el seed especializado fuerte.`,
      alternatives: addUniqueAlternative([...local.alternatives], {
        code: full.code, description: full.label, dutyRatePct: null, score: 0,
        reasons: ['Alternativa full-catalog de menor confianza.'], simOpening: null,
      }).slice(0, 4),
      rationale: [...local.rationale, ...full.rationale],
      missingFacts: [...new Set([...local.missingFacts, ...full.missingFacts])],
      catalogScope: `Full ARCA snapshot (${full.catalogRecordCount} NCM) + seed especializado`,
      catalogSourceDate: full.sourceDate,
      reviewedAt: full.sourceDate,
    }
  }

  const sameAsLocal = local.ncmCandidate === full.code
  const usableLocalDuty = sameAsLocal && fullStrong ? local.dutyRatePct : null
  let combinedAlternatives = apiAlternatives(full)
  for (const candidate of local.alternatives) combinedAlternatives = addUniqueAlternative(combinedAlternatives, candidate)

  return {
    ...local,
    ncmCandidate: full.code,
    simOpeningCandidate: sameAsLocal ? local.simOpeningCandidate ?? null : null,
    classificationConfidence: full.confidence,
    dutyRatePct: usableLocalDuty,
    dutyRateStatus: usableLocalDuty === null ? 'missing' : 'candidate',
    description: full.label,
    alternatives: combinedAlternatives.filter((candidate) => candidate.code !== full.code).slice(0, 4),
    missingFacts: [...new Set([...full.missingFacts, ...(sameAsLocal ? local.missingFacts : [])])],
    rationale: [...full.rationale, ...(sameAsLocal ? local.rationale : []), ...(usableLocalDuty === null ? ['Full-catalog retrieval no contiene semántica tarifaria validada; el derecho permanece pendiente.'] : ['El candidato full-catalog coincide con el seed especializado; se conserva el derecho candidato del seed para screening.'])],
    source: `${full.source} · Full snapshot ${full.sourceDate}, ${full.catalogRecordCount} NCM. ${full.retrievalMode}. ${usableLocalDuty === null ? 'Derecho no resuelto por el índice full-catalog.' : 'Coincide con seed especializado; derecho candidato conservado para screening.'}`,
    reviewedAt: full.sourceDate,
    catalogScope: `Full ARCA snapshot (${full.catalogRecordCount} posiciones NCM); retrieval sin datos tarifarios ni SIM globales`,
    catalogSourceDate: full.sourceDate,
  }
}

export async function classifyNcmRemote(facts: FullNcmFacts): Promise<FullNcmApiResult> {
  const response = await fetch('/api/ncm-classify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(facts),
  })
  if (!response.ok) throw new Error(`Full NCM retrieval unavailable (${response.status})`)
  const result = await response.json() as FullNcmApiResult
  if (!result || !['candidate', 'missing'].includes(result.status) || typeof result.catalogRecordCount !== 'number') {
    throw new Error('Invalid full NCM response')
  }
  return result
}
