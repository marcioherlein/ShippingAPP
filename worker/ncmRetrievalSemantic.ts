import {
  classifyFullNcm,
  retrieveNcmCandidates,
  type FullNcmClassification,
  type NcmProductFacts,
  type NcmRetrievalCandidate,
  type NcmSearchIndex,
} from './ncmRetrieval'
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
  return top.score >= 32 && gap(items) >= 8 && distinct >= 3 ? 'medium' : 'low'
}

export async function classifyFullNcmWithSemantic(
  index: NcmSearchIndex,
  ai: AI,
  facts: NcmProductFacts,
): Promise<FullNcmClassification> {
  const base = await classifyFullNcm(index, ai, facts)
  const raw = retrieveNcmCandidates(index, base.searchTerms, facts, 50)
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
