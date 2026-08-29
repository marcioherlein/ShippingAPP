import type { CustomsProfile, NcmTariffProfile, SimEvidenceConfidence } from './customsClassification'
import type { NcmCandidate } from './ncmClassifier'
import type { NcmSimOpening } from './ncmCatalog'

export type FullSimApiResult = {
  status: 'candidate' | 'single' | 'missing' | 'not_found' | 'unavailable'
  ncmCode: string
  ncmLabel: string | null
  candidate: { code: string; label: string; score: number } | null
  alternatives: Array<{ code: string; label: string; score: number }>
  confidence: 'high' | 'medium' | 'low' | 'missing'
  rationale: string[]
  missingFacts: string[]
  sourceDate: string | null
}

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
  tariff?: NcmTariffProfile | null
  sim?: FullSimApiResult | null
}

export type FullNcmFacts = {
  name?: string | null
  category?: string | null
  material?: string | null
  functionText?: string | null
  description?: string | null
}

function strong(confidence: CustomsProfile['classificationConfidence'] | FullNcmApiResult['confidence'] | SimEvidenceConfidence) {
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

function validSimForNcm(code: string, ncmCode: string) {
  return /^\d{4}\.\d{2}\.\d{2}\.\d{3}[A-Z]$/.test(code) && code.startsWith(`${ncmCode}.`)
}

function apiSimOpening(value: FullSimApiResult['candidate'], ncmCode: string): NcmSimOpening | null {
  if (!value || !validSimForNcm(value.code, ncmCode)) return null
  return { code: value.code, description: value.label, matchTerms: [] }
}

function apiSimAlternatives(sim: FullSimApiResult | null | undefined, ncmCode: string) {
  if (!sim) return []
  return sim.alternatives
    .filter((item) => validSimForNcm(item.code, ncmCode))
    .map((item) => ({ code: item.code, description: item.label, matchTerms: [] }))
    .slice(0, 4)
}

function mergeUniqueSim(items: NcmSimOpening[], candidate: NcmSimOpening | null) {
  if (!candidate || items.some((item) => item.code === candidate.code)) return items
  return [...items, candidate]
}

function applyTariff(base: CustomsProfile, tariff: NcmTariffProfile | null | undefined): CustomsProfile {
  if (!tariff) return base
  return {
    ...base,
    tariff,
    dutyRatePct: tariff.diePct,
    dutyRateStatus: 'candidate',
    statisticsRatePct: tariff.tePct,
    vatRatePct: tariff.vatPct,
    vatAdditionalRatePct: tariff.vatAdditionalPct,
    gainsRatePct: tariff.gainsPct,
    iibbRatePct: tariff.iibbPct,
    capitalGoodEligible: tariff.capitalGoodEligible,
  }
}

function applySimEvidence(base: CustomsProfile, full: FullNcmApiResult): CustomsProfile {
  const ncmCode = base.ncmCandidate
  const sim = full.sim
  if (!ncmCode || !sim || sim.ncmCode !== ncmCode) return base

  const fullCandidate = apiSimOpening(sim.candidate, ncmCode)
  const fullAlternatives = apiSimAlternatives(sim, ncmCode)
  const localCandidate = base.simOpeningCandidate ?? null
  const localConfidence = base.simOpeningConfidence ?? (localCandidate ? base.classificationConfidence : 'missing')

  if (['missing', 'not_found', 'unavailable'].includes(sim.status) || !fullCandidate) {
    return {
      ...base,
      simOpeningConfidence: localCandidate ? localConfidence : 'missing',
      simAlternatives: base.simAlternatives ?? [],
      simSource: localCandidate
        ? `${base.simSource || 'Seed especializado'} · SIM full-catalog ${sim.status}; se conserva evidencia local.`
        : `SIM full-catalog ${sim.status}; no se inventa apertura.`,
      rationale: [...base.rationale, ...sim.rationale],
      missingFacts: [...new Set([...base.missingFacts, ...sim.missingFacts])],
    }
  }

  if (localCandidate && localCandidate.code === fullCandidate.code) {
    return {
      ...base,
      simOpeningCandidate: localCandidate,
      simOpeningConfidence: strong(sim.confidence) && strong(localConfidence) ? 'high' : localConfidence,
      simAlternatives: fullAlternatives.filter((item) => item.code !== localCandidate.code),
      simSource: `Seed especializado + snapshot SIM ARCA ${sim.sourceDate || full.sourceDate}: coincidencia ${localCandidate.code}.`,
      rationale: [...base.rationale, ...sim.rationale, `SIM seed/full coinciden en ${localCandidate.code}.`],
      missingFacts: [...new Set([...base.missingFacts, ...sim.missingFacts])],
    }
  }

  if (localCandidate && strong(localConfidence) && strong(sim.confidence) && localCandidate.code !== fullCandidate.code) {
    return {
      ...base,
      simOpeningCandidate: null,
      simOpeningConfidence: 'low',
      simAlternatives: mergeUniqueSim([localCandidate, ...fullAlternatives], fullCandidate).slice(0, 4),
      simSource: `CONFLICTO SIM: seed ${localCandidate.code} vs full ${fullCandidate.code}. NCM ${ncmCode} se conserva; apertura requiere validación.`,
      rationale: [...base.rationale, ...sim.rationale, `CONFLICTO SIM fuerte: ${localCandidate.code} vs full ${fullCandidate.code}. El conflicto no cambia la NCM ni el derecho NCM-level de screening, pero bloquea el sufijo automático.`],
      missingFacts: [...new Set([...base.missingFacts, ...sim.missingFacts, 'Resolver conflicto de apertura SIM antes de declarar/intervenciones'])],
    }
  }

  if (localCandidate && strong(localConfidence) && !strong(sim.confidence) && localCandidate.code !== fullCandidate.code) {
    return {
      ...base,
      simOpeningCandidate: localCandidate,
      simOpeningConfidence: localConfidence,
      simAlternatives: mergeUniqueSim([...(base.simAlternatives ?? []), ...fullAlternatives], fullCandidate).filter((item) => item.code !== localCandidate.code).slice(0, 4),
      simSource: `${base.simSource || 'Seed especializado'} · full SIM alternativo ${fullCandidate.code} con confidence ${sim.confidence}; no desplaza seed fuerte.`,
      rationale: [...base.rationale, ...sim.rationale],
      missingFacts: [...new Set([...base.missingFacts, ...sim.missingFacts])],
    }
  }

  return {
    ...base,
    simOpeningCandidate: fullCandidate,
    simOpeningConfidence: sim.confidence,
    simAlternatives: fullAlternatives.filter((item) => item.code !== fullCandidate.code),
    simSource: `Snapshot SIM ARCA ${sim.sourceDate || full.sourceDate} · ${sim.status} · ${sim.confidence}.`,
    rationale: [...base.rationale, ...sim.rationale, `Apertura SIM full-catalog candidata: ${fullCandidate.code}.`],
    missingFacts: [...new Set([...base.missingFacts, ...sim.missingFacts])],
  }
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

  // Defense in depth: even if the worker regresses and returns a tariff-bearing LOW
  // candidate, the client merge is not allowed to promote it into NCM/economics.
  if (full.confidence === 'low') {
    const lowAlternative: NcmCandidate | null = full.code !== local.ncmCandidate ? {
      code: full.code,
      description: full.label,
      dutyRatePct: null,
      score: 0,
      reasons: ['Candidato full-catalog LOW retenido; no apto para economics.'],
      simOpening: null,
    } : null
    return {
      ...local,
      alternatives: addUniqueAlternative([...local.alternatives], lowAlternative).slice(0, 4),
      missingFacts: [...new Set([...local.missingFacts, ...full.missingFacts, 'Validar candidato full-catalog LOW antes de usar aranceles'])],
      rationale: [...local.rationale, ...full.rationale, `FAIL-CLOSED CLIENT: ${full.code} llegó con confidence LOW; no se promueve a NCM ni se aplica su tarifa.`],
      source: `${local.source} Full-catalog devolvió ${full.code} con confidence LOW; retenido como alternativa, economics sin cambios.`,
      catalogScope: `Full ARCA snapshot (${full.catalogRecordCount} NCM) + ${local.catalogScope}`,
      catalogSourceDate: full.sourceDate || local.catalogSourceDate,
      reviewedAt: full.sourceDate || local.reviewedAt,
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
      simOpeningConfidence: 'missing', simAlternatives: [], simSource: 'SIM no evaluada por conflicto NCM.',
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
    const fullAlternative: NcmCandidate | null = full.code !== local.ncmCandidate ? {
      code: full.code, description: full.label, dutyRatePct: null, score: 0,
      reasons: ['Alternativa full-catalog de menor confianza.'], simOpening: null,
    } : null
    const kept = applyTariff({
      ...local,
      source: `${local.source} Full-catalog devolvió ${full.code} con confidence ${full.confidence}; no desplaza el seed especializado fuerte.`,
      alternatives: addUniqueAlternative([...local.alternatives], fullAlternative).slice(0, 4),
      rationale: [...local.rationale, ...full.rationale],
      missingFacts: [...new Set([...local.missingFacts, ...full.missingFacts])],
      catalogScope: `Full ARCA snapshot (${full.catalogRecordCount} NCM) + seed especializado`,
      catalogSourceDate: full.sourceDate,
      reviewedAt: full.sourceDate,
    }, full.code === local.ncmCandidate ? full.tariff : null)
    return full.code === local.ncmCandidate ? applySimEvidence(kept, full) : kept
  }

  const sameAsLocal = local.ncmCandidate === full.code
  const usableDuty = full.tariff?.diePct ?? (sameAsLocal && fullStrong ? local.dutyRatePct : null)
  const usableStatus = usableDuty === null ? 'missing' : 'candidate'
  let combinedAlternatives = apiAlternatives(full)
  for (const candidate of local.alternatives) combinedAlternatives = addUniqueAlternative(combinedAlternatives, candidate)

  const merged = applyTariff({
    ...local,
    ncmCandidate: full.code,
    simOpeningCandidate: sameAsLocal ? local.simOpeningCandidate ?? null : null,
    simOpeningConfidence: sameAsLocal ? local.simOpeningConfidence ?? 'missing' : 'missing',
    simAlternatives: sameAsLocal ? local.simAlternatives ?? [] : [],
    simSource: sameAsLocal ? local.simSource : 'SIM pendiente de hidratación full-catalog.',
    classificationConfidence: full.confidence,
    dutyRatePct: usableDuty,
    dutyRateStatus: usableStatus,
    description: full.label,
    alternatives: combinedAlternatives.filter((candidate) => candidate.code !== full.code).slice(0, 4),
    missingFacts: [...new Set([...full.missingFacts, ...(sameAsLocal ? local.missingFacts : [])])],
    rationale: [...full.rationale, ...(sameAsLocal ? local.rationale : []), ...(full.tariff ? ['La tabla NCM_APP aporta derecho, IVA/percepciones y elegibilidad Bien de Uso para esta NCM.'] : sameAsLocal && usableDuty !== null ? ['El candidato full-catalog coincide con el seed especializado; se conserva el derecho candidato del seed para screening.'] : ['Full-catalog retrieval no contiene semántica tarifaria validada; el derecho permanece pendiente.'])],
    source: `${full.source} · Full snapshot ${full.sourceDate}, ${full.catalogRecordCount} NCM. ${full.retrievalMode}. ${full.tariff ? 'Tarifa integrada desde NCM_APP.' : sameAsLocal && usableDuty !== null ? 'Coincide con seed especializado; derecho candidato conservado para screening.' : 'Derecho no resuelto por el índice full-catalog.'}`,
    reviewedAt: full.sourceDate,
    catalogScope: `Full ARCA snapshot (${full.catalogRecordCount} posiciones NCM); retrieval NCM + hidratación SIM por capítulo; tarifas NCM_APP cuando están disponibles`,
    catalogSourceDate: full.sourceDate,
  }, full.tariff ?? null)
  return applySimEvidence(merged, full)
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
