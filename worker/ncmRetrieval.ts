import { deterministicCustomsTerms } from './ncmVocabulary'

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
type AiRanking = {
  ranking: Array<{ code: string; reason?: string }>
  confidence?: 'high' | 'medium' | 'low'
  missingFacts?: string[]
  attempted: boolean
}

// Structured AI is an optional enrichment layer. Retrieval itself must remain
// useful without it, because marketplace language and customs language often
// differ and Workers AI can be temporarily unavailable.
export const NCM_STRUCTURED_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast'

const SEARCH_EXPANSION_SCHEMA = {
  type: 'object',
  properties: {
    searchTerms: { type: 'array', items: { type: 'string' } },
    missingFacts: { type: 'array', items: { type: 'string' } },
  },
  required: ['searchTerms', 'missingFacts'],
}

const RANKING_SCHEMA = {
  type: 'object',
  properties: {
    ranking: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['code'],
      },
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    missingFacts: { type: 'array', items: { type: 'string' } },
  },
  required: ['ranking', 'confidence', 'missingFacts'],
}

function jsonSchemaResponse(json_schema: Record<string, unknown>) {
  return { type: 'json_schema', json_schema }
}

const STOPWORDS = new Set([
  'de','del','la','las','el','los','un','una','unos','unas','y','o','e','para','por','con','sin','en','al','se','su','sus','que','como','tipo','otro','otra','dema',
  'the','of','and','or','for','with','without','in','a','an','to','other','product','producto','articulo','material','equipment','equipo',
])

const ACCESSORY_MARKERS = new Set([
  'funda','estuche','cubierta','cover','case','pantalla','shade','cierre','zipper','accesorio','accessory','parte','part',
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
  if (token.length > 5 && (token.endsWith('ntes') || token.endsWith('phones'))) token = token.slice(0, -1)
  else if (token.length > 6 && token.endsWith('es') && !token.endsWith('ies')) token = token.slice(0, -2)
  else if (token.length > 4 && token.endsWith('s') && !token.endsWith('is') && !token.endsWith('us')) token = token.slice(0, -1)
  return token
}

function tokens(value: string) {
  const raw = normalizeText(value).split(' ')
  return [...new Set(raw.map(canonicalToken).filter((token) => token.length >= 3 && !STOPWORDS.has(token)))]
}

function hasAccessorySignal(value: string) {
  return tokens(value).some((token) => ACCESSORY_MARKERS.has(token))
}

function safeTerms(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length >= 3 && value.length <= 180)
    .filter((value) => !/\b\d{4}[.]?\d{2}[.]?\d{2}\b/.test(value))
  )].slice(0, 28)
}

export function retrieveNcmCandidates(index: NcmSearchIndex, searchTerms: string[], facts: NcmProductFacts, limit = 25): NcmRetrievalCandidate[] {
  if (!index || index.meta.indexSchema !== 3 || !Array.isArray(index.records)) return []
  const safeSearchTerms = safeTerms(searchTerms)
  const rawPhrases = [
    ...safeSearchTerms,
    facts.name || '',
    facts.category || '',
    facts.functionText || '',
    facts.material || '',
    facts.description || '',
  ].filter(Boolean)
  const phraseNorms = [...new Set(rawPhrases.map(normalizeText).filter((phrase) => phrase.length >= 4 && phrase.length <= 180))]
  const queryTokens = [...new Set(rawPhrases.flatMap(tokens))]
  if (queryTokens.length < 2 && phraseNorms.every((phrase) => phrase.split(' ').length < 2)) return []

  const accessoryIntent = hasAccessorySignal([
    facts.name || '', facts.category || '', facts.functionText || '', facts.description || '', ...safeSearchTerms,
  ].join(' '))

  const scored: NcmRetrievalCandidate[] = []
  for (const row of index.records) {
    if (!Array.isArray(row) || row.length < 2) continue
    const [code, label] = row
    if (!/^\d{4}\.\d{2}\.\d{2}$/.test(code) || typeof label !== 'string') continue
    const normalizedLabel = normalizeText(label)
    const normalizedLeaf = normalizeText(label.split('>').pop() || label)
    if (!normalizedLabel) continue
    if (accessoryIntent && !hasAccessorySignal(normalizedLabel)) continue
    const labelTokens = new Set(tokens(normalizedLabel))
    const leafTokens = new Set(tokens(normalizedLeaf))
    const matchedTerms: string[] = []
    let score = 0

    for (const phrase of phraseNorms) {
      if (phrase.split(' ').length < 2 || !normalizedLabel.includes(phrase)) continue
      score += Math.min(34, 14 + phrase.length / 3)
      // A full-hierarchy label repeats parent concepts across many child NCMs.
      // Matching the terminal ARCA description is more discriminating, so give
      // it an additional bounded bonus rather than treating all hierarchy text
      // as equally informative.
      if (normalizedLeaf.includes(phrase)) score += Math.min(26, 12 + phrase.length / 4)
      matchedTerms.push(phrase)
    }
    for (const token of queryTokens) {
      if (!labelTokens.has(token)) continue
      const weight = token.length >= 9 ? 9 : token.length >= 6 ? 6 : 3
      score += weight
      if (leafTokens.has(token)) score += Math.min(5, Math.max(2, Math.round(weight / 2)))
      matchedTerms.push(token)
    }

    const distinctMatches = new Set(matchedTerms).size
    if (score >= 8 && distinctMatches >= 2) scored.push({ code, label, score: Math.round(score * 100) / 100, matchedTerms: [...new Set(matchedTerms)] })
  }

  return scored.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code)).slice(0, Math.max(1, Math.min(50, limit)))
}

async function expandSearchTerms(ai: AI, facts: NcmProductFacts): Promise<AiExpansion> {
  try {
    const result: any = await ai.run(NCM_STRUCTURED_AI_MODEL, {
      messages: [
        { role: 'system', content: 'You prepare search vocabulary for Argentina customs nomenclature retrieval. Return JSON only: {"searchTerms":[...],"missingFacts":[...]}. searchTerms must be Spanish customs/product nouns or short phrases describing what the product IS, its principal function, material/composition and important technical nature. Include useful synonyms/translations. NEVER output HS, NCM, tariff or numeric classification codes. Do not guess missing technical facts. Preserve whether the item is a complete product, accessory, replacement part, cover, case or component; never turn an accessory into its parent product.' },
        { role: 'user', content: JSON.stringify(facts) },
      ],
      response_format: jsonSchemaResponse(SEARCH_EXPANSION_SCHEMA), temperature: 0, max_tokens: 350,
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
  return { ranking, confidence, missingFacts, attempted: true }
}

async function rerankShortlist(ai: AI, facts: NcmProductFacts, shortlist: NcmRetrievalCandidate[]): Promise<AiRanking> {
  try {
    const result: any = await ai.run(NCM_STRUCTURED_AI_MODEL, {
      messages: [
        { role: 'system', content: 'You review ONLY the supplied Argentina NCM candidates. Return JSON only: {"ranking":[{"code":"EXACT_ALLOWED_CODE","reason":"short reason"}],"confidence":"high|medium|low","missingFacts":[...]}. Never create a code. If product facts are insufficient, still rank only allowed codes but use low confidence and explain missing facts. Classification depends on objective product characteristics/function, never origin country, price or intended profit. Never classify an accessory, cover, case, replacement part or component as the complete parent product. Your ranking is advisory: deterministic evidence may remain controlling when it is materially stronger.' },
        { role: 'user', content: JSON.stringify({ product: facts, allowedCandidates: shortlist.map(({ code, label, score }) => ({ code, label, score })) }) },
      ],
      response_format: jsonSchemaResponse(RANKING_SCHEMA), temperature: 0, max_tokens: 550,
    })
    const content = result?.response ?? result?.choices?.[0]?.message?.content
    return sanitizeAiRanking(content, shortlist)
  } catch {
    return { ranking: [], missingFacts: [], attempted: false }
  }
}

function scoreGap(shortlist: NcmRetrievalCandidate[]) {
  if (!shortlist.length) return 0
  return shortlist[1] ? shortlist[0].score - shortlist[1].score : shortlist[0].score
}

function deterministicConfidence(shortlist: NcmRetrievalCandidate[]): 'medium' | 'low' {
  const top = shortlist[0]
  if (!top) return 'low'
  const distinct = new Set(top.matchedTerms).size
  return top.score >= 32 && scoreGap(shortlist) >= 8 && distinct >= 3 ? 'medium' : 'low'
}

function chooseTop(shortlist: NcmRetrievalCandidate[], ranked: AiRanking) {
  const deterministicTop = shortlist[0]
  const deterministicStrong = deterministicConfidence(shortlist) === 'medium'
  const aiTopCode = ranked.ranking[0]?.code
  if (!aiTopCode || aiTopCode === deterministicTop.code || deterministicStrong) return deterministicTop

  const aiTop = shortlist.find((candidate) => candidate.code === aiTopCode)
  if (!aiTop) return deterministicTop
  const gapToDeterministic = deterministicTop.score - aiTop.score
  if (ranked.confidence === 'high' && gapToDeterministic <= 5) return aiTop
  return deterministicTop
}

function deriveConfidence(
  shortlist: NcmRetrievalCandidate[],
  ranked: AiRanking,
  selected: NcmRetrievalCandidate,
): 'high' | 'medium' | 'low' {
  const deterministicTop = shortlist[0]
  const detConfidence = deterministicConfidence(shortlist)
  const aiTop = ranked.ranking[0]?.code

  if (!ranked.ranking.length) {
    if (ranked.attempted) return 'low'
    return selected.code === deterministicTop.code ? detConfidence : 'low'
  }
  if (selected.code !== deterministicTop.code) return 'low'
  if (aiTop !== deterministicTop.code) return 'low'
  if (ranked.confidence === 'low') return 'low'

  if (deterministicTop.score >= 42 && scoreGap(shortlist) >= 12 && ranked.confidence === 'high') return 'high'
  return detConfidence
}

export async function classifyFullNcm(index: NcmSearchIndex, ai: AI, facts: NcmProductFacts): Promise<FullNcmClassification> {
  const expansion = await expandSearchTerms(ai, facts)
  const deterministicTerms = deterministicCustomsTerms(facts)
  const originalTerms = safeTerms([facts.name || '', facts.category || '', facts.functionText || '', facts.material || ''])
  const searchTerms = safeTerms([...deterministicTerms, ...expansion.searchTerms, ...originalTerms])
  const shortlist = retrieveNcmCandidates(index, searchTerms, facts, 25)
  if (!shortlist.length) {
    return {
      status: 'missing', code: null, label: null, confidence: 'missing', alternatives: [],
      missingFacts: [...new Set([...expansion.missingFacts, 'Describir con más precisión qué es el producto y su función principal.'])].slice(0, 8),
      rationale: ['El índice oficial no produjo una shortlist con evidencia textual suficiente; no se inventa una NCM.'],
      searchTerms, sourceDate: index.meta.sourceDate, source: index.meta.source, catalogRecordCount: index.meta.recordCount, retrievalMode: 'missing',
    }
  }

  const ranked = await rerankShortlist(ai, facts, shortlist)
  const top = chooseTop(shortlist, ranked)
  const confidence = deriveConfidence(shortlist, ranked, top)
  const aiTop = ranked.ranking[0]?.code
  const reason = ranked.ranking.find((item) => item.code === top.code)?.reason
  const alternatives = shortlist
    .filter((candidate) => candidate.code !== top.code)
    .slice(0, 3)
    .map(({ code, label, score }) => ({ code, label, score }))

  return {
    status: 'candidate', code: top.code, label: top.label, confidence,
    alternatives,
    missingFacts: [...new Set([...expansion.missingFacts, ...(ranked.missingFacts || [])])].slice(0, 8),
    rationale: [
      'El candidato pertenece a la snapshot oficial ARCA; el retrieval determinístico controla la selección cuando su evidencia es fuerte.',
      ...(reason ? [reason] : []),
      `Retrieval determinístico: ${shortlist[0].code} score ${shortlist[0].score}.`,
      ...(aiTop && aiTop !== shortlist[0].code ? [`AI sugirió ${aiTop}; ${top.code === shortlist[0].code ? 'no desplazó' : 'reordenó sólo por cercanía'} la evidencia determinística.`] : []),
      ...(!ranked.ranking.length ? [ranked.attempted
        ? 'Workers AI respondió, pero no produjo un ranking válido dentro de la shortlist; confianza reducida.'
        : 'Workers AI no estuvo disponible; se aplicó sólo evidencia determinística y la confianza máxima queda limitada.'] : []),
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
