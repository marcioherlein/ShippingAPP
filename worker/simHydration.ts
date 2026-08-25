import { normalizeText, canonicalToken, type NcmProductFacts } from './ncmRetrieval'

export type SimOpening = { code: string; label: string; score: number }
export type SimResolution = {
  status: 'candidate' | 'single' | 'missing' | 'not_found'
  ncmCode: string
  ncmLabel: string | null
  candidate: SimOpening | null
  alternatives: SimOpening[]
  confidence: 'high' | 'medium' | 'low' | 'missing'
  rationale: string[]
  missingFacts: string[]
  sourceDate: string | null
}

type AI = { run: (model: string, input: unknown) => Promise<unknown> }
type Assets = { fetch: (request: Request) => Promise<Response> }
type ChapterPayload = {
  meta: { sourceDate: string; simIndexSchema: number; tariffDataIncluded: boolean; chapter: string; recordCount: number }
  records: Array<[string, string, Array<[string, string]>]>
}

const chapterCache = new Map<string, Promise<ChapterPayload>>()

function tokens(value: string) {
  return [...new Set(normalizeText(value).split(' ').map(canonicalToken).filter((token) => token.length >= 3))]
}

function factsText(facts: NcmProductFacts) {
  return [facts.name, facts.category, facts.material, facts.functionText, facts.description].filter(Boolean).join(' ')
}

function isPadelFacts(facts: NcmProductFacts) {
  const text = normalizeText(factsText(facts))
  return /\bpadel\b/.test(text) && /\b(paleta|raqueta|racket|racquet)\b/.test(text)
}

export function scoreSimOpenings(openings: Array<[string, string]>, facts: NcmProductFacts): SimOpening[] {
  const factTokens = new Set(tokens(factsText(facts)))
  const scored = openings.map(([code, label]) => {
    const labelTokens = tokens(label)
    let score = 0
    for (const token of labelTokens) {
      if (!factTokens.has(token)) continue
      score += token.length >= 9 ? 10 : token.length >= 6 ? 7 : 4
    }
    const normalizedFacts = normalizeText(factsText(facts))
    const normalizedLabel = normalizeText(label)
    if (normalizedLabel && normalizedFacts.includes(normalizedLabel)) score += 25
    return { code, label, score }
  })
  return scored.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
}

export function sanitizeSimRanking(output: unknown, allowed: SimOpening[]) {
  let parsed: any = output
  if (typeof output === 'string') {
    try { parsed = JSON.parse(output) } catch { parsed = {} }
  }
  const allowedCodes = new Set(allowed.map((item) => item.code))
  const seen = new Set<string>()
  const ranking: Array<{ code: string; reason?: string }> = []
  for (const item of Array.isArray(parsed?.ranking) ? parsed.ranking : []) {
    if (!item || typeof item.code !== 'string' || !allowedCodes.has(item.code) || seen.has(item.code)) continue
    seen.add(item.code)
    ranking.push({ code: item.code, reason: typeof item.reason === 'string' ? item.reason.slice(0, 400) : undefined })
  }
  const confidence = ['high', 'medium', 'low'].includes(parsed?.confidence) ? parsed.confidence as 'high' | 'medium' | 'low' : undefined
  const missingFacts = Array.isArray(parsed?.missingFacts) ? parsed.missingFacts.filter((v: unknown): v is string => typeof v === 'string').slice(0, 8) : []
  return { ranking, confidence, missingFacts }
}

async function loadChapter(requestUrl: string, assets: Assets, chapter: string): Promise<ChapterPayload> {
  if (!/^\d{2}$/.test(chapter)) throw new Error('Invalid SIM chapter')
  if (!chapterCache.has(chapter)) {
    const promise = (async () => {
      const url = new URL(`/data/sim/${chapter}.json`, requestUrl)
      const response = await assets.fetch(new Request(url.toString()))
      if (!response.ok) throw new Error(`SIM chapter ${chapter} unavailable (${response.status})`)
      const data = await response.json() as ChapterPayload
      if (data?.meta?.simIndexSchema !== 1 || data?.meta?.tariffDataIncluded !== false || data?.meta?.chapter !== chapter || !Array.isArray(data.records)) {
        throw new Error(`SIM chapter ${chapter} failed integrity checks`)
      }
      return data
    })().catch((error) => {
      chapterCache.delete(chapter)
      throw error
    })
    chapterCache.set(chapter, promise)
  }
  return chapterCache.get(chapter)!
}

async function rerank(ai: AI, ncmCode: string, ncmLabel: string, openings: SimOpening[], facts: NcmProductFacts) {
  try {
    const result: any = await ai.run('@cf/zai-org/glm-4.7-flash', {
      messages: [
        { role: 'system', content: 'Rerank ONLY the supplied Argentina SIM openings for the already-selected NCM. Return JSON only: {"ranking":[{"code":"EXACT_ALLOWED_SIM_CODE","reason":"short reason"}],"confidence":"high|medium|low","missingFacts":[...]}. Never create a code and never change the NCM. Use objective product characteristics only. If facts cannot distinguish openings, use low confidence and state exactly what is missing.' },
        { role: 'user', content: JSON.stringify({ ncmCode, ncmLabel, product: facts, allowedOpenings: openings.map(({ code, label }) => ({ code, label })) }) },
      ],
      response_format: { type: 'json_object' }, temperature: 0, max_completion_tokens: 450,
    })
    const content = result?.response ?? result?.choices?.[0]?.message?.content
    return sanitizeSimRanking(content, openings)
  } catch {
    return { ranking: [], confidence: undefined, missingFacts: [] as string[] }
  }
}

export async function resolveSimOpening(requestUrl: string, assets: Assets, ai: AI, ncmCode: string, facts: NcmProductFacts): Promise<SimResolution> {
  if (!/^\d{4}\.\d{2}\.\d{2}$/.test(ncmCode)) throw new Error('Invalid NCM for SIM hydration')
  const chapter = ncmCode.slice(0, 2)
  const payload = await loadChapter(requestUrl, assets, chapter)
  const row = payload.records.find((record) => record[0] === ncmCode)
  if (!row) return { status: 'not_found', ncmCode, ncmLabel: null, candidate: null, alternatives: [], confidence: 'missing', rationale: ['La snapshot SIM no contiene aperturas para esta NCM.'], missingFacts: [], sourceDate: payload.meta.sourceDate }

  const [, ncmLabel, rawOpenings] = row
  const openings = scoreSimOpenings(rawOpenings, facts)
  if (!openings.length) return { status: 'missing', ncmCode, ncmLabel, candidate: null, alternatives: [], confidence: 'missing', rationale: ['La NCM existe en la snapshot pero no tiene aperturas SIM utilizables.'], missingFacts: [], sourceDate: payload.meta.sourceDate }

  if (ncmCode === '9506.59.00' && isPadelFacts(facts)) {
    const residual = openings.find((item) => item.code === '9506.59.00.900Z')
    if (residual) {
      return {
        status: 'candidate', ncmCode, ncmLabel, candidate: residual,
        alternatives: openings.filter((item) => item.code !== residual.code).slice(0, 4),
        confidence: 'low',
        rationale: [
          'Producto identificado como pádel dentro de 9506.59.00; no se lo fuerza a badminton ni squash por coincidencias textuales débiles.',
          'Se conserva apertura residual oficial 900Z con confidence LOW hasta validación de despachante/SIM.',
        ],
        missingFacts: ['Validar apertura SIM residual con despachante antes de declarar'],
        sourceDate: payload.meta.sourceDate,
      }
    }
  }

  if (openings.length === 1) return { status: 'single', ncmCode, ncmLabel, candidate: openings[0], alternatives: [], confidence: 'high', rationale: ['La fuente oficial contiene una única apertura SIM para la NCM seleccionada.'], missingFacts: [], sourceDate: payload.meta.sourceDate }

  const aiRank = await rerank(ai, ncmCode, ncmLabel, openings.slice(0, 40), facts)
  const aiTop = aiRank.ranking[0]?.code
  const byCode = new Map(openings.map((item) => [item.code, item]))
  const candidate = (aiTop && byCode.get(aiTop)) || openings[0]
  const second = openings.find((item) => item.code !== candidate.code)
  const deterministicTop = openings[0]
  const gap = second ? candidate.score - second.score : candidate.score
  let confidence: SimResolution['confidence'] = 'low'
  if (aiTop === deterministicTop.code && aiRank.confidence === 'high' && deterministicTop.score >= 20 && gap >= 8) confidence = 'high'
  else if (aiTop === deterministicTop.code && aiRank.confidence !== 'low' && deterministicTop.score >= 10 && gap >= 3) confidence = 'medium'

  return {
    status: 'candidate', ncmCode, ncmLabel, candidate,
    alternatives: openings.filter((item) => item.code !== candidate.code).slice(0, 4),
    confidence,
    rationale: [
      'Las aperturas provienen exclusivamente del capítulo SIM oficial correspondiente a la NCM seleccionada.',
      ...(aiRank.ranking.find((item) => item.code === candidate.code)?.reason ? [aiRank.ranking.find((item) => item.code === candidate.code)!.reason!] : []),
      ...(aiTop && aiTop !== deterministicTop.code ? ['El reranking AI no coincidió con el top determinístico; confidence queda LOW.'] : []),
    ],
    missingFacts: aiRank.missingFacts,
    sourceDate: payload.meta.sourceDate,
  }
}

export function resetSimCacheForTests() { chapterCache.clear() }