import {
  classifyFullNcm,
  retrieveNcmCandidates,
  type FullNcmClassification,
  type NcmProductFacts,
  type NcmRetrievalCandidate,
  type NcmSearchIndex,
} from './ncmRetrieval'
import { deterministicCustomsTerms } from './ncmVocabulary'
import { semanticAdjustment, semanticRerankNcmCandidates } from './ncmSemantic'

type AI = { run: (model: string, input: unknown) => Promise<unknown> }

function gap(items: NcmRetrievalCandidate[]) {
  if (!items.length) return 0
  return items[1] ? items[0].score - items[1].score : items[0].score
}

function semanticConfidence(items: NcmRetrievalCandidate[]): 'medium' | 'low' {
  const top = items[0]
  if (!top) return 'low'
  const distinct = new Set(top.matchedTerms).size
  return top.score >= 32 && gap(items) >= 8 && distinct >= 2 ? 'medium' : 'low'
}

function mergeCandidatePools(...pools: NcmRetrievalCandidate[][]) {
  const byCode = new Map<string, NcmRetrievalCandidate>()
  for (const pool of pools) {
    for (const candidate of pool) {
      const existing = byCode.get(candidate.code)
      if (!existing) {
        byCode.set(candidate.code, candidate)
        continue
      }
      byCode.set(candidate.code, {
        ...candidate,
        score: Math.max(existing.score, candidate.score),
        matchedTerms: [...new Set([...existing.matchedTerms, ...candidate.matchedTerms])],
      })
    }
  }
  return [...byCode.values()]
}

function identityTerms(facts: NcmProductFacts) {
  const identityFacts: NcmProductFacts = {
    name: facts.name,
    category: facts.category,
    functionText: facts.functionText,
    material: null,
    description: null,
  }
  const genericMaterial = /^(materia textil|textil de poliester|diodos emisores de luz led)$/i
  return deterministicCustomsTerms(identityFacts).filter((term) => !genericMaterial.test(term))
}

function rawByCode(raw: NcmRetrievalCandidate[], code: string | null) {
  return code ? raw.find((candidate) => candidate.code === code) ?? null : null
}

export async function classifyFullNcmWithSemantic(
  index: NcmSearchIndex,
  ai: AI,
  facts: NcmProductFacts,
): Promise<FullNcmClassification> {
  const base = await classifyFullNcm(index, ai, facts)

  const fullPool = retrieveNcmCandidates(index, base.searchTerms, facts, 50)
  const identityFacts: NcmProductFacts = { ...facts, material: null, description: null }
  const identityPool = retrieveNcmCandidates(index, identityTerms(facts), identityFacts, 50)
  const raw = mergeCandidatePools(identityPool, fullPool)
  const semantic = semanticRerankNcmCandidates(raw, facts)
  if (!semantic.length) return base

  const top = semantic[0]
  const confidence = semanticConfidence(semantic)
  const alternatives = semantic.slice(1, 4).map(({ code, label, score }) => ({ code, label, score }))
  const baseRaw = rawByCode(raw, base.code)
  const topRaw = rawByCode(raw, top.code)
  const baseAdjustment = baseRaw ? semanticAdjustment(baseRaw, facts) : 0
  const topAdjustment = topRaw ? semanticAdjustment(topRaw, facts) : 0
  const semanticDelta = top.code !== base.code ? topAdjustment - baseAdjustment : 0
  const strongContradiction = top.code !== base.code && semanticDelta >= 50

  if (confidence === 'medium') {
    const changed = base.code !== top.code
    return {
      ...base,
      status: 'candidate',
      code: top.code,
      label: top.label,
      confidence: base.code === top.code && base.confidence === 'high' ? 'high' : 'medium',
      alternatives,
      rationale: [
        ...base.rationale,
        `Reconciliación semántica determinística: ${top.code} score ${top.score}, gap ${gap(semantic).toFixed(2)}.`,
        ...(changed ? ['La evidencia objetiva del producto corrigió una rama vecina que contradecía sus características.'] : []),
      ],
    }
  }

  if (base.status === 'missing') {
    return {
      ...base,
      status: 'candidate',
      code: top.code,
      label: top.label,
      confidence: 'low',
      alternatives,
      rationale: [...base.rationale, 'La reconciliación encontró candidatos oficiales, pero no una ventaja suficiente; se requiere aclaración.'],
    }
  }

  // Never preserve a base MEDIUM solely because lexical scoring liked it when
  // objective child-path/SIM evidence strongly contradicts that branch. If the
  // semantic winner is not yet decisive enough for MEDIUM, return it LOW so the
  // clarification gate blocks tariffs and asks the user instead of promoting a
  // contradicted code.
  if (strongContradiction) {
    return {
      ...base,
      status: 'candidate',
      code: top.code,
      label: top.label,
      confidence: 'low',
      alternatives,
      rationale: [
        ...base.rationale,
        `La evidencia semántica contradice el candidato base (delta ${semanticDelta.toFixed(2)}); economics permanece bloqueado hasta aclarar.`,
      ],
    }
  }

  if (base.confidence === 'high' || base.confidence === 'medium') return base
  return {
    ...base,
    code: top.code,
    label: top.label,
    confidence: 'low',
    alternatives,
    rationale: [...base.rationale, `Reconciliación semántica insuficiente para promover tarifas; gap ${gap(semantic).toFixed(2)}.`],
  }
}
