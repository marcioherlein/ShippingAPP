import {
  classifyFullNcm,
  retrieveNcmCandidates,
  type FullNcmClassification,
  type NcmProductFacts,
  type NcmRetrievalCandidate,
  type NcmSearchIndex,
} from './ncmRetrieval'
import { deterministicCustomsTerms } from './ncmVocabulary'
import { semanticRerankNcmCandidates } from './ncmSemantic'

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
      // Preserve the strongest deterministic score while unioning evidence.
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
  // Product identity/function should survive even when broad material vocabulary
  // floods the global shortlist. Material remains available in the full pool and
  // in semantic reconciliation, but is deliberately not allowed to crowd the
  // identity pool out of the top 50.
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

  // A viable but unresolved shortlist is more useful than `missing`: it lets the
  // clarification layer ask for the actual discriminating characteristic while
  // tariffs remain blocked. Never promote a low semantic tie to economics.
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
