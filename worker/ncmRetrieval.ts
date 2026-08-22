export type NcmIndexRecord = [code: string, label: string]

export type NcmSearchIndex = {
  meta: {
    source: string
    sourceFile: string
    sourceDate: string
    parserSchema: number
    indexSchema: number
    recordCount: number
    tariffDataIncluded: boolean
    simOpeningsIncluded: boolean
    recordShape: string
  }
  records: NcmIndexRecord[]
}

export type NcmRetrievalCandidate = {
  code: string
  label: string
  score: number
  matchedTerms: string[]
}

export type NcmProductFacts = {
  name?: string | null
  category?: string | null
  material?: string | null
  functionText?: string | null
  description?: string | null
}

export type FullNcmClassification = {
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

type AI = { run: (model: string, input: unknown) => Promise<unknown> }

type AiExpansion = { searchTerms: string[]; missingFacts: string[] }
type AiRanking = { ranking: Array<{ code: string; reason?: string }>; confidence?: 'high' | 'medium' | 'low'; missingFacts?: string[] }

const STOPWORDS = new Set([
  'de','del','la','las','el','los','un','una','unos','unas','y','o','e','para','por','con','sin','en','al','se','su','sus','que','como','tipo','otro','otra','dema',
  'the','of','and','or','for','with','without','in','a','an','to','other','product','producto','articulo','material','equipment','equipo',
])

export function normalizeText(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function canonicalToken(value: string) {
  let token = normalizeText(value)
  if (!token || token.length < 3) return token
  // Conservative singularization for retrieval only. Avoid fuzzy/edit-distance
  // matching: it can cross customs concepts. This handles ordinary Spanish
  // plural/adjective forms such as raquetas→raqueta, similares→similar and
  // convertidores→convertidor while preserving words like tenis.
  if (token.length > 6 && token.endsWith('es') && !token.endsWith('ies')) token = token.slice(0, -2)
  else if (token.length > 4 && token.endsWith('s') && !token.endsWith('is') && !token.endsWith('us')) token = token.slice(0, -1)
  return token
}

function tokens(value: string) {
  const raw = normalizeText(value).split(' ')
  return [...new Set(raw.map(canonicalToken).filter((token) => token.length >= 3 && !STOPWORDS.has(token)))]
}

function safeTerms(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length >= 3 && value.length <= 100)
    .filter((value) => !/\b\d{4}[.]?\d{2}[.]?\d{2}\b/.test(value))
  )].slice(0, 14)
}

function baseTokenWeight(token: string) {
  return token.length >= 9 ? 9 : token.length >= 6 ? 6 : 3
}

function rarityBonus(totalDocuments: number, documentFrequency: number) {
  if (!totalDocuments || !documentFrequency) return 0
  // Customs nouns such as "convertidor" or "secador" are much more useful
  // than ubiquitous electrical/material words. A capped IDF-style bonus keeps
  // rare discriminators from being crowded out by many sibling NCM leaves.
  const idf = Math.log2((totalDocuments + 1) / (documentFrequency + 1))
  return Math.max(0, Math.min(18, idf * 3))
}

export function retrieveNcmCandidates(index: NcmSearchIndex, searchTerms: string[], facts: NcmProductFacts, limit = 25): NcmRetrievalCandidate[] {
  if (!index || index.meta.indexSchema !== 3 || !Array.isArray(index.records)) return []
  const rawPhrases = [...safeTerms(searchTerms), facts.name || '', facts.category || '', facts.functionText || '', facts.material || ''].filter(Boolean)
  const phraseNorms = [...new Set(rawPhrases.map(normalizeText).filter((phrase) => phrase.length >= 4))]
  const queryTokens = [...new Set(rawPhrases.flatMap(tokens))]
  if (queryTokens.length < 2 && phraseNorms.every((phrase) => phrase.split(' ').length < 2)) return []

  const prepared = index.records.flatMap((row) => {
    if (!Array.isArray(row) || row.length < 2) return []
    const [code, label] = row
    if (!/^\d{4}\.\d{2}\.\d{2}$/.test(code) || typeof label !== 'string') return []
    const normalizedLabel = normalizeText(label)
    if (!normalizedLabel) return []
    return [{ code, label, normalizedLabel, labelTokens: new Set(tokens(normalizedLabel)) }]
  })

  const documentFrequency = new Map<string, number>()
  for (const token of queryTokens) documentFrequency.set(token, 0)
  for (const row of prepared) {
    for (const token of queryTokens) {
      if (row.labelTokens.has(token)) documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1)
    }
  }

  const cohesivePhrases = phraseNorms
    .map((phrase) => ({ phrase, tokens: tokens(phrase) }))
    .filter((item) => item.tokens.length >= 2 && item.tokens.length <= 5)

  const scored: NcmRetrievalCandidate[] = []
  for (const row of prepared) {
    const matchedTerms: string[] = []
    let score = 0

    for (const phrase of phraseNorms) {
      if (phrase.split(' ').length >= 2 && row.normalizedLabel.includes(phrase)) {
        score += Math.min(30, 12 + phrase.length / 3)
        matchedTerms.push(phrase)
      }
    }

    // Allow ordinary customs wording variations ("secadores para el cabello"
    // vs "secador de cabello") without fuzzy spelling or semantic guessing.
    // All meaningful tokens from the short phrase must be present.
    for (const item of cohesivePhrases) {
      if (row.normalizedLabel.includes(item.phrase)) continue
      if (item.tokens.every((token) => row.labelTokens.has(token))) {
        score += 8 + item.tokens.length * 4
        matchedTerms.push(item.phrase)
      }
    }

    for (const token of queryTokens) {
      if (!row.labelTokens.has(token)) continue
      const weight = baseTokenWeight(token) + rarityBonus(prepared.length, documentFrequency.get(token) || 0)
      score += weight
      matchedTerms.push(token)
    }

    const distinctMatches = new Set(matchedTerms).size
    if (score >= 8 && distinctMatches >= 2) {
      scored.push({ code: row.code, label: row.label, score: Math.round(score * 100) / 100, matchedTerms: [...new Set(matchedTerms)] })
    }
  }

  return scored.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code)).slice(0, Math.max(1, Math.min(50, limit)))
}

async function expandSearchTerms(ai: AI, facts: NcmProductFacts): Promise<AiExpansion> {
  try {
    const result: any = await ai.run('@cf/zai-org/glm-4.7-flash', {
      messages: [
        { role: 'system', content: 'You prepare search vocabulary for Argentina customs nomenclature retrieval. Return JSON only: {"searchTerms":[...],"missingFacts":[...]}. searchTerms must be Spanish customs/product nouns or short phrases describing what the product IS, its principal function, material/composition and important technical nature. Include useful synonyms/translations. NEVER output HS, NCM, tariff or numeric classification codes. Do not guess missing technical facts.' },
        { role: 'user', content: JSON.stringify(facts) },
      ],
      response_format: { type: 'json_object' }, temperature: 0, max_completion_tokens: 350,
    })
    const content = result?.response ?? result?.choices?.[0]?.message?.content
    const parsed = typeof content === 'string' ? JSON.parse(content) : content
    return {
      searchTerms: safeTerms(parsed?.searchTerms),
      missingFacts: Array.isArray(parsed?.missingFacts) ? parsed.missingFacts.filter((v: unknown): v is string => typeof v === 'string').slice(0, 8) : [],
    }
  } catch {
    return { searchTerms: [], missingFacts: [] }
  }
}

export function sanitizeAiRanking(output: unknown, shortlist: NcmRetrievalCandidate[]): AiRanking {
  const allowed = new Map(shortlist.map((candidate) => [candidate.code, candidate]))
  let parsed: any = output
  if (typeof output === 'string') {
    try { parsed = JSON.parse(output) } catch { parsed = {} }
  }
  const rankingInput = Array.isArray(parsed?.ranking) ? parsed.ranking : []
  const seen = new Set<string>()
  const ranking: Array<{ code: string; reason?: string }> = []
  for (const item of rankingInput) {
    if (!item || typeof item.code !== 'string' || !allowed.has(item.code) || seen.has(item.code)) continue
    seen.add(item.code)
    ranking.push({ code: item.code, reason: typeof item.reason === 'string' ? item.reason.slice(0, 400) : undefined })
  }
  const confidence = ['high','medium','low'].includes(parsed?.confidence) ? parsed.confidence : undefined
  const missingFacts = Array.isArray(parsed?.missingFacts) ? parsed.missingFacts.filter((v: unknown): v is string => typeof v === 'string').slice(0, 8) : []
  return { ranking, confidence, missingFacts }
}

async function rerankShortlist(ai: AI, facts: NcmProductFacts, shortlist: NcmRetrievalCandidate[]): Promise<AiRanking> {
  try {
    const result: any = await ai.run('@cf/zai-org/glm-4.7-flash', {
      messages: [
        { role: 'system', content: 'You rerank ONLY the supplied Argentina NCM candidates. Return JSON only: {"ranking":[{"code":"EXACT_ALLOWED_CODE","reason":"short reason"}],"confidence":"high|medium|low","missingFacts":[...]}. Never create a code. If product facts are insufficient, still rank only allowed codes but use low confidence and explain missing facts. Classification depends on objective product characteristics/function, never origin country, price or intended profit.' },
        { role: 'user', content: JSON.stringify({ product: facts, allowedCandidates: shortlist.map(({ code, label }) => ({ code, label })) }) },
      ],
      response_format: { type: 'json_object' }, temperature: 0, max_completion_tokens: 550,
    })
    const content = result?.response ?? result?.choices?.[0]?.message?.content
    return sanitizeAiRanking(content, shortlist)
  } catch {
    return { ranking: [], missingFacts: [] }
  }
}

function deriveConfidence(shortlist: NcmRetrievalCandidate[], ranked: AiRanking): 'high' | 'medium' | 'low' {
  if (!shortlist.length) return 'low'
  const deterministicTop = shortlist[0]
  const aiTop = ranked.ranking[0]?.code
  const second = shortlist[1]
  const gap = second ? deterministicTop.score - second.score : deterministicTop.score
  if (aiTop === deterministicTop.code && deterministicTop.score >= 38 && gap >= 10 && ranked.confidence === 'high') return 'high'
  if (aiTop === deterministicTop.code && deterministicTop.score >= 22 && gap >= 4 && ranked.confidence !== 'low') return 'medium'
  return 'low'
}

export async function classifyFullNcm(index: NcmSearchIndex, ai: AI, facts: NcmProductFacts): Promise<FullNcmClassification> {
  const expansion = await expandSearchTerms(ai, facts)
  const fallbackTerms = safeTerms([facts.name || '', facts.category || '', facts.functionText || '', facts.material || ''])
  const searchTerms = expansion.searchTerms.length ? expansion.searchTerms : fallbackTerms
  const shortlist = retrieveNcmCandidates(index, searchTerms, facts, 25)
  if (!shortlist.length) {
    return {
      status: 'missing', code: null, label: null, confidence: 'missing', alternatives: [],
      missingFacts: expansion.missingFacts, rationale: ['El índice oficial no produjo una shortlist con evidencia textual suficiente; no se inventa una NCM.'],
      searchTerms, sourceDate: index.meta.sourceDate, source: index.meta.source, catalogRecordCount: index.meta.recordCount, retrievalMode: 'missing',
    }
  }

  const ranked = await rerankShortlist(ai, facts, shortlist)
  const orderedCodes = ranked.ranking.map((item) => item.code)
  const byCode = new Map(shortlist.map((candidate) => [candidate.code, candidate]))
  const ordered = [
    ...orderedCodes.map((code) => byCode.get(code)).filter((item): item is NcmRetrievalCandidate => !!item),
    ...shortlist.filter((candidate) => !orderedCodes.includes(candidate.code)),
  ]
  const top = ordered[0]
  const confidence = ranked.ranking.length ? deriveConfidence(shortlist, ranked) : 'low'
  const reason = ranked.ranking.find((item) => item.code === top.code)?.reason

  return {
    status: 'candidate', code: top.code, label: top.label, confidence,
    alternatives: ordered.slice(1, 4).map(({ code, label, score }) => ({ code, label, score })),
    missingFacts: [...new Set([...expansion.missingFacts, ...(ranked.missingFacts || [])])].slice(0, 8),
    rationale: [
      'El candidato pertenece a la snapshot oficial ARCA; el modelo sólo pudo reordenar códigos de la shortlist determinística.',
      ...(reason ? [reason] : []),
      `Retrieval determinístico: ${shortlist[0].code} score ${shortlist[0].score}.`,
      ...(top.code !== shortlist[0].code ? [`AI rerank seleccionó ${top.code} dentro de la shortlist permitida.`] : []),
    ],
    searchTerms, sourceDate: index.meta.sourceDate, source: index.meta.source, catalogRecordCount: index.meta.recordCount,
    retrievalMode: ranked.ranking.length ? 'ai_reranked' : 'deterministic_fallback',
  }
}

let cachedIndex: Promise<NcmSearchIndex> | null = null

export async function loadNcmIndex(requestUrl: string, assets: { fetch: (request: Request) => Promise<Response> }): Promise<NcmSearchIndex> {
  if (!cachedIndex) {
    cachedIndex = (async () => {
      const url = new URL('/data/ncm-index.json', requestUrl)
      const response = await assets.fetch(new Request(url.toString()))
      if (!response.ok) throw new Error(`NCM index unavailable (${response.status})`)
      const data = await response.json() as NcmSearchIndex
      if (data?.meta?.indexSchema !== 3 || data?.meta?.tariffDataIncluded !== false || !Array.isArray(data.records) || data.records.length < 10000) {
        throw new Error('NCM index failed integrity checks')
      }
      return data
    })().catch((error) => {
      cachedIndex = null
      throw error
    })
  }
  return cachedIndex
}

export function resetNcmIndexCacheForTests() { cachedIndex = null }
