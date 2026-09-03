import { ncmAppTariffOverride } from './ncmTariffOverrides'
import { deriveClarifications, deriveSemanticConcepts, type SemanticConcepts } from './semanticConcepts'

export type NcmIndexRecord = [
  code: string,
  label: string,
  aecPct?: number,
  diePct?: number,
  tePct?: number,
  diiPct?: number,
  vatPct?: number,
  vatAdditionalPct?: number,
  gainsPct?: number,
  iibbPct?: number,
  internalTax?: string | number | null,
  capitalGoodEligible?: boolean | 0 | 1 | 'SI' | 'NO',
]

export type NcmTariff = {
  aecPct: number
  diePct: number
  tePct: number
  diiPct: number
  vatPct: number
  vatAdditionalPct: number
  gainsPct: number
  iibbPct: number
  internalTax: string | number | null
  capitalGoodEligible: boolean
}

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
    tariffShape?: string
    filters?: string[]
  }
  records: NcmIndexRecord[]
}

export type NcmRetrievalCandidate = {
  code: string
  label: string
  score: number
  matchedTerms: string[]
  // Positive score before negative-evidence penalties (observability).
  positiveScore?: number
  // Penalty applied because the candidate label matched product exclusion evidence.
  penalty?: number
  // Human-readable exclusion terms that conflicted with this candidate's label.
  conflicts?: string[]
}

export type ClassificationDiagnostics = {
  // Canonical concept keys that fired (e.g. 'beverage_container', '!vacuum_insulated').
  normalizedConcepts: string[]
  // Positive Spanish retrieval terms actually used.
  positiveConcepts: string[]
  // Negative/exclusion terms applied during retrieval.
  negativeConcepts: string[]
  // Structured normalized facts.
  material: string | null
  construction: string | null
  activeMechanism: string | null
  // Top candidate scores with any penalties/conflicts (never the whole catalog).
  topCandidates: Array<{ code: string; score: number; positiveScore?: number; penalty?: number; conflicts?: string[] }>
  // Why the confidence gate resolved as it did.
  confidenceReason: string
  // What triggered a clarification, if any.
  clarificationTrigger: string | null
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
  tariff: NcmTariff | null
  diagnostics?: ClassificationDiagnostics
}

type AI = { run: (model: string, input: unknown) => Promise<unknown> }
type AiExpansion = { searchTerms: string[]; negativeTerms: string[]; missingFacts: string[] }
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
  if (token.length > 6 && token.endsWith('es') && !token.endsWith('ies')) token = token.slice(0, -2)
  else if (token.length > 4 && token.endsWith('s') && !token.endsWith('is') && !token.endsWith('us')) token = token.slice(0, -1)
  return token
}

function tokens(value: string) {
  return [...new Set(normalizeText(value).split(' ')
    .map(canonicalToken)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token)))]
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

function factsText(facts: NcmProductFacts) {
  return [facts.name, facts.category, facts.material, facts.functionText, facts.description].filter(Boolean).join(' ')
}

function conventionalWristwatchText(facts: NcmProductFacts) {
  const text = normalizeText(factsText(facts))
  const smartOrConnected = /\b(smartwatch|smart watch|smart watches|fitness tracker|gps watch|bluetooth watch)\b/.test(text)
  const accessoryOrPart = /\b(watch band|watch strap|watch bracelet|correa para reloj|pulsera para reloj|watch movement|movement only|mecanismo de reloj|watch parts|partes de reloj)\b/.test(text)
  const explicitWristwatch = /\b(wristwatch|wrist watch|wristwatches|reloj de pulsera|relojes de pulsera)\b/.test(text)
  const mechanicalWatch = /\b(watch|watches|reloj|relojes)\b/.test(text) && /\b(mechanical|mecanico|mecanica|mecanicos|mecanicas)\b/.test(text)
  return !smartOrConnected && !accessoryOrPart && (explicitWristwatch || mechanicalWatch) ? text : null
}

function automaticMechanicalCommonMetalWristwatch(facts: NcmProductFacts) {
  const text = conventionalWristwatchText(facts)
  if (!text) return false
  const automatic = /\b(automatic|automatico|automatica|automaticos|automaticas)\b/.test(text)
  const mechanical = /\b(mechanical|mecanico|mecanica|mecanicos|mecanicas)\b/.test(text)
  const commonMetal = /\b(stainless steel|acero inoxidable|steel case|caja de acero|metal comun)\b/.test(text)
  const preciousMetal = /\b(gold|oro|platinum|platino|silver|plata|precious metal|metal precioso|plaque|chapado de metal precioso)\b/.test(text)
  return automatic && mechanical && commonMetal && !preciousMetal
}

// High-certainty family gates are intentionally conservative. They do not pick an NCM;
// they make semantically impossible chapters unavailable to retrieval. More families can
// be added here only with regression coverage.
function allowedChapterPrefixes(facts: NcmProductFacts): string[] | null {
  if (conventionalWristwatchText(facts)) return ['91']
  return null
}

function toNumber(value: unknown, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function tariffFromRecord(row: NcmIndexRecord | null | undefined): NcmTariff | null {
  if (!row || row.length < 12) return null
  return {
    aecPct: toNumber(row[2]),
    diePct: toNumber(row[3]),
    tePct: toNumber(row[4]),
    diiPct: toNumber(row[5]),
    vatPct: toNumber(row[6], 21),
    vatAdditionalPct: toNumber(row[7], 20),
    gainsPct: toNumber(row[8], 6),
    iibbPct: toNumber(row[9], 2.5),
    internalTax: row[10] ?? null,
    capitalGoodEligible: row[11] === true || row[11] === 1 || row[11] === 'SI',
  }
}

function tariffForCode(index: NcmSearchIndex, code: string | null | undefined) {
  if (!code) return null
  const rowTariff = tariffFromRecord(index.records.find((record) => record[0] === code))
  return rowTariff ?? ncmAppTariffOverride(code)
}

function officialFromRow(index: NcmSearchIndex, row: NcmIndexRecord | null | undefined) {
  if (!row) return null
  return { code: row[0], label: row[1], tariff: tariffForCode(index, row[0]) }
}

function findOfficial(index: NcmSearchIndex, code: string) {
  return officialFromRow(index, index.records.find((record) => record[0] === code))
}

function findOfficialByPrefix(index: NcmSearchIndex, codePrefix: string) {
  return officialFromRow(index, index.records.find(([code, label]) => code.startsWith(codePrefix) && typeof label === 'string' && label.trim()))
}

function findOfficialByLabel(index: NcmSearchIndex, codePrefix: string, labelTerms: string[]) {
  const normalizedTerms = labelTerms.map(normalizeText).filter(Boolean)
  return officialFromRow(index, index.records.find(([code, label]) => {
    if (!code.startsWith(codePrefix) || typeof label !== 'string' || !label.trim()) return false
    const normalizedLabel = normalizeText(label)
    return normalizedTerms.every((term) => normalizedLabel.includes(term))
  }))
}

function shortcutClassification(
  index: NcmSearchIndex,
  official: { code: string; label: string; tariff: NcmTariff | null },
  searchTerms: string[],
  rationale: string,
): FullNcmClassification {
  return {
    status: 'candidate',
    code: official.code,
    label: official.label,
    confidence: 'medium',
    alternatives: [],
    missingFacts: [],
    searchTerms,
    rationale: [
      'Shortcut determinístico validado contra la snapshot oficial ARCA; no se inventa código y se evita depender del AI para productos de identidad obvia.',
      ...(official.tariff ? ['Tarifa NCM_APP aplicada automáticamente para economics de screening.'] : []),
      rationale,
    ],
    sourceDate: index.meta.sourceDate,
    source: index.meta.source,
    catalogRecordCount: index.meta.recordCount,
    retrievalMode: 'deterministic_fallback',
    tariff: official.tariff,
  }
}

function deterministicKnownNcm(index: NcmSearchIndex, facts: NcmProductFacts, concepts: SemanticConcepts): FullNcmClassification | null {
  const text = normalizeText(factsText(facts))

  if (automaticMechanicalCommonMetalWristwatch(facts)) {
    const official = findOfficial(index, '9102.21.00')
    if (official) {
      return shortcutClassification(
        index,
        official,
        ['reloj de pulsera', 'automatico', 'mecanico', 'acero inoxidable'],
        'Producto identificado como reloj de pulsera mecánico automático con evidencia de caja/material de metal común; se excluye la partida 91.01 de caja de metal precioso.',
      )
    }
  }

  // Language-invariant insulated-beverage-container shortcut. Fires only when the semantic
  // layer asserts BOTH a beverage-container function AND vacuum-insulated construction and
  // insulation is not explicitly denied. This is what makes an English "vacuum flask", a
  // Spanish "termo aislado por vacío" and a mixed "vacuum flask de acero inoxidable"
  // converge on 9617.00.10 without any per-language token hardcoding. A plain plastic bottle
  // whose spec says "thermal insulation: none" carries '!vacuum_insulated' and never reaches
  // here.
  const insulatedBeverage = concepts.concepts.includes('beverage_container')
    && concepts.concepts.includes('vacuum_insulated')
    && !concepts.concepts.includes('!vacuum_insulated')
  if (insulatedBeverage) {
    const official = findOfficial(index, '9617.00.10')
    if (official) {
      return shortcutClassification(
        index,
        official,
        ['termo', 'recipiente isotermico', 'aislado por vacio', 'botella termica'],
        'Producto identificado como termo / recipiente isotérmico aislado por vacío (evidencia de aislamiento térmico + función de recipiente para bebidas), con independencia del idioma de la ficha.',
      )
    }
  }

  const isCamera = ['camara', 'camera', 'security camera', 'ip camera', 'wifi camera'].some((term) => text.includes(normalizeText(term)))
  if (isCamera) {
    const official = findOfficial(index, '8525.89.19')
      || findOfficialByLabel(index, '8525.', ['camara'])
      || findOfficialByLabel(index, '8525.', ['camaras'])
      || findOfficialByPrefix(index, '8525.')
    if (official) return shortcutClassification(index, official, ['camara', 'ip', 'security camera'], 'Producto identificado como cámara IP/digital de seguridad.')
  }

  const isSunglasses = ['gafas de sol', 'anteojos de sol', 'sunglasses'].some((term) => text.includes(normalizeText(term)))
  if (isSunglasses) {
    const official = findOfficial(index, '9004.10.00')
    if (official) return shortcutClassification(index, official, ['gafas de sol', 'sunglasses'], 'Producto identificado como gafas/anteojos de sol.')
  }

  const checks: Array<{ code: string; terms: string[]; rationale: string }> = [
    { code: '9506.59.00', terms: ['padel', 'paleta', 'racket'], rationale: 'Producto identificado como paleta/raqueta de pádel.' },
    { code: '8504.40.90', terms: ['cargador'], rationale: 'Producto identificado como adaptador/cargador eléctrico.' },
    { code: '8507.60.00', terms: ['litio', 'lithium', 'bateria', 'battery'], rationale: 'Producto identificado como acumulador de ion litio.' },
    { code: '9506.51.00', terms: ['tenis', 'raqueta'], rationale: 'Producto identificado como raqueta de tenis.' },
    { code: '9506.40.00', terms: ['tenis de mesa', 'ping pong'], rationale: 'Producto identificado como artículo para tenis de mesa.' },
    { code: '9506.91.00', terms: ['mancuerna', 'gimnasio', 'fitness'], rationale: 'Producto identificado como artículo/equipo para ejercicio físico.' },
    { code: '4202.92.00', terms: ['mochila', 'backpack'], rationale: 'Producto identificado como mochila/bolso con superficie textil o plástica.' },
    { code: '9617.00.10', terms: ['botella', 'termica'], rationale: 'Producto identificado como botella/termo isotérmico.' },
    { code: '8518.30.00', terms: ['auricular', 'headphones', 'earbuds'], rationale: 'Producto identificado como auriculares.' },
    { code: '8518.21.00', terms: ['parlante', 'speaker'], rationale: 'Producto identificado como altavoz/parlante portátil.' },
    { code: '8471.60.52', terms: ['teclado'], rationale: 'Producto identificado como teclado, unidad de entrada para máquina automática de procesamiento de datos.' },
    { code: '8471.60.53', terms: ['mouse'], rationale: 'Producto identificado como mouse, unidad de entrada para máquina automática de procesamiento de datos.' },
    { code: '9405.42.00', terms: ['lampara', 'led'], rationale: 'Producto identificado como aparato eléctrico de alumbrado LED.' },
    { code: '8516.71.00', terms: ['cafetera', 'coffee maker', 'espresso'], rationale: 'Producto identificado como aparato eléctrico para preparar café.' },
    { code: '8516.10.00', terms: ['termotanque', 'water heater'], rationale: 'Producto identificado como calentador eléctrico de agua.' },
    { code: '8471.30.19', terms: ['notebook'], rationale: 'Producto identificado como computadora portátil/notebook.' },
    { code: '8541.43.00', terms: ['panel', 'solar'], rationale: 'Producto identificado como panel solar fotovoltaico.' },
    { code: '6404.11.00', terms: ['zapatillas'], rationale: 'Producto identificado como calzado deportivo con suela de caucho/plástico y capellada textil.' },
  ]

  for (const check of checks) {
    if (!check.terms.every((term) => text.includes(normalizeText(term)))) continue
    const official = findOfficial(index, check.code)
    if (official) return shortcutClassification(index, official, check.terms, check.rationale)
  }
  return null
}

export function retrieveNcmCandidates(index: NcmSearchIndex, searchTerms: string[], facts: NcmProductFacts, limit = 25, exclusionTerms: string[] = []): NcmRetrievalCandidate[] {
  if (!index || ![3, 4].includes(index.meta.indexSchema) || !Array.isArray(index.records)) return []
  const rawPhrases = [...safeTerms(searchTerms), facts.name || '', facts.category || '', facts.functionText || '', facts.material || ''].filter(Boolean)
  const phraseNorms = [...new Set(rawPhrases.map(normalizeText).filter((phrase) => phrase.length >= 4))]
  const queryTokens = [...new Set(rawPhrases.flatMap(tokens))]
  if (queryTokens.length < 2 && phraseNorms.every((phrase) => phrase.split(' ').length < 2)) return []

  // Negative-evidence tokens: normalized exclusion substrings matched against candidate
  // labels. These are penalties, not query terms — they never add score, only subtract it.
  const exclusionNorms = [...new Set(exclusionTerms.map(normalizeText).filter((term) => term.length >= 3))]

  const chapterPrefixes = allowedChapterPrefixes(facts)
  const scored: NcmRetrievalCandidate[] = []
  for (const row of index.records) {
    if (!Array.isArray(row) || row.length < 2) continue
    const [code, label] = row
    if (!/^\d{4}\.\d{2}\.\d{2}$/.test(code) || typeof label !== 'string' || !label.trim()) continue
    if (chapterPrefixes && !chapterPrefixes.some((prefix) => code.startsWith(prefix))) continue
    const normalizedLabel = normalizeText(label)
    const labelTokens = new Set(tokens(normalizedLabel))
    const matchedTerms: string[] = []
    let score = 0

    for (const phrase of phraseNorms) {
      if (phrase.split(' ').length >= 2 && normalizedLabel.includes(phrase)) {
        score += Math.min(30, 12 + phrase.length / 3)
        matchedTerms.push(phrase)
      }
    }
    for (const token of queryTokens) {
      if (!labelTokens.has(token)) continue
      const weight = token.length >= 9 ? 9 : token.length >= 6 ? 6 : 3
      score += weight
      matchedTerms.push(token)
    }

    // Inclusion is decided on POSITIVE evidence only: a candidate must earn its place with
    // real textual overlap. Contradicted families are not silently promoted by a negative.
    if (score < 8 || new Set(matchedTerms).size < 2) continue
    const positiveScore = Math.round(score * 100) / 100

    // Negative-evidence penalty: each distinct exclusion concept present in the label is a
    // contradiction between the product and the candidate family. Penalize heavily so
    // lexical overlap on generic words (recipiente, thermal, stainless…) cannot outrank a
    // family the product explicitly is not.
    const conflicts: string[] = []
    for (const exclusion of exclusionNorms) {
      if (normalizedLabel.includes(exclusion)) conflicts.push(exclusion)
    }
    const penalty = conflicts.length ? 18 + (conflicts.length - 1) * 8 : 0
    const finalScore = Math.round((positiveScore - penalty) * 100) / 100

    scored.push({
      code,
      label,
      score: finalScore,
      matchedTerms: [...new Set(matchedTerms)],
      positiveScore,
      ...(penalty ? { penalty, conflicts } : {}),
    })
  }

  return scored.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code)).slice(0, Math.max(1, Math.min(50, limit)))
}

async function expandSearchTerms(ai: AI, facts: NcmProductFacts): Promise<AiExpansion> {
  try {
    const result: any = await ai.run('@cf/zai-org/glm-4.7-flash', {
      messages: [
        { role: 'system', content: 'You prepare search vocabulary for Argentina customs nomenclature retrieval. Return JSON only: {"searchTerms":[...],"negativeTerms":[...],"missingFacts":[...]}. searchTerms must be Spanish customs/product nouns or short phrases describing what the product IS, its principal function, material/composition and important technical nature. negativeTerms must be Spanish customs concepts that the product explicitly is NOT (e.g. "isotérmico", "eléctrico", "refrigeración", "correctora") ONLY when the evidence explicitly denies them; never guess. Include useful synonyms/translations. NEVER output HS, NCM, tariff or numeric classification codes. Do not guess missing technical facts.' },
        { role: 'user', content: JSON.stringify(facts) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_completion_tokens: 380,
    })
    const content = result?.response ?? result?.choices?.[0]?.message?.content
    const parsed = typeof content === 'string' ? JSON.parse(content) : content
    return {
      searchTerms: safeTerms(parsed?.searchTerms),
      negativeTerms: safeTerms(parsed?.negativeTerms),
      missingFacts: Array.isArray(parsed?.missingFacts) ? parsed.missingFacts.filter((v: unknown): v is string => typeof v === 'string').slice(0, 8) : [],
    }
  } catch {
    return { searchTerms: [], negativeTerms: [], missingFacts: [] }
  }
}

export function sanitizeAiRanking(output: unknown, shortlist: NcmRetrievalCandidate[]): AiRanking {
  const allowed = new Map(shortlist.map((candidate) => [candidate.code, candidate]))
  let parsed: any = output
  if (typeof output === 'string') {
    try { parsed = JSON.parse(output) } catch { parsed = {} }
  }
  const seen = new Set<string>()
  const ranking: Array<{ code: string; reason?: string }> = []
  for (const item of Array.isArray(parsed?.ranking) ? parsed.ranking : []) {
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
      response_format: { type: 'json_object' },
      temperature: 0,
      max_completion_tokens: 550,
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
  // A sole official candidate with meaningful deterministic evidence plus an explicit
  // HIGH AI agreement is usable at MEDIUM confidence. This preserves narrow, clear
  // catalog matches without allowing disagreements or weak multi-candidate cases through.
  if (aiTop === deterministicTop.code && !second && deterministicTop.score >= 12 && ranked.confidence === 'high') return 'medium'
  return 'low'
}

function buildDiagnostics(
  concepts: SemanticConcepts,
  positiveTerms: string[],
  exclusionTerms: string[],
  ordered: NcmRetrievalCandidate[],
  confidenceReason: string,
  clarificationTrigger: string | null,
): ClassificationDiagnostics {
  return {
    normalizedConcepts: concepts.concepts,
    positiveConcepts: positiveTerms.slice(0, 14),
    negativeConcepts: exclusionTerms.slice(0, 14),
    material: concepts.material,
    construction: concepts.construction,
    activeMechanism: concepts.activeMechanism,
    topCandidates: ordered.slice(0, 4).map((c) => ({
      code: c.code, score: c.score, positiveScore: c.positiveScore, penalty: c.penalty, conflicts: c.conflicts,
    })),
    confidenceReason,
    clarificationTrigger,
  }
}

export async function classifyFullNcm(index: NcmSearchIndex, ai: AI, facts: NcmProductFacts): Promise<FullNcmClassification> {
  // Deterministic, language-independent semantic normalization runs first and unconditionally
  // — it is the language-invariance floor and it feeds both retrieval and observability even
  // when the AI expansion later degrades to nothing.
  const concepts = deriveSemanticConcepts(facts)
  // Specific, structured clarification questions asked only when they would change the
  // classification. Surfaced on fail-closed paths so the user is asked something precise
  // ("¿tiene aislamiento al vacío?") instead of a generic "¿qué es?".
  const clarifications = deriveClarifications(concepts).map((c) => c.question)

  const deterministic = deterministicKnownNcm(index, facts, concepts)
  if (deterministic) {
    return {
      ...deterministic,
      diagnostics: buildDiagnostics(concepts, deterministic.searchTerms, concepts.exclusionTerms, [], 'Shortcut determinístico de identidad obvia validado contra la snapshot oficial.', null),
    }
  }

  const expansion = await expandSearchTerms(ai, facts)
  const fallbackTerms = safeTerms([facts.name || '', facts.category || '', facts.functionText || '', facts.material || ''])
  // Merge the deterministic Spanish concept vocabulary with the AI expansion. The concept
  // terms guarantee tariff vocabulary reaches retrieval regardless of the source language;
  // the AI expansion supplements with synonyms. Deterministic exclusions are unioned with
  // any AI-provided negative terms.
  const aiOrFallback = expansion.searchTerms.length ? expansion.searchTerms : fallbackTerms
  const searchTerms = [...new Set([...concepts.positiveTerms, ...aiOrFallback])].slice(0, 20)
  const exclusionTerms = [...new Set([...concepts.exclusionTerms, ...expansion.negativeTerms])]
  const shortlist = retrieveNcmCandidates(index, searchTerms, facts, 25, exclusionTerms)
  if (!shortlist.length) {
    return {
      status: 'missing', code: null, label: null, confidence: 'missing', alternatives: [], tariff: null,
      missingFacts: [...new Set([...clarifications, ...expansion.missingFacts])].slice(0, 8),
      rationale: ['El índice oficial no produjo una shortlist con evidencia textual suficiente; no se inventa una NCM.'],
      searchTerms,
      sourceDate: index.meta.sourceDate,
      source: index.meta.source,
      catalogRecordCount: index.meta.recordCount,
      retrievalMode: 'missing',
      diagnostics: buildDiagnostics(concepts, searchTerms, exclusionTerms, [], 'Sin shortlist: evidencia textual insuficiente contra el índice oficial.', 'evidencia insuficiente para recuperar candidatos'),
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
  const combinedMissingFacts = [...new Set([...expansion.missingFacts, ...(ranked.missingFacts || [])])].slice(0, 8)

  if (confidence === 'low') {
    const confidenceReason = top.code !== shortlist[0].code
      ? `AI rerank (${top.code}) discrepó del top determinístico (${shortlist[0].code}); fail-closed.`
      : `Evidencia insuficiente para superar el umbral de confianza (score ${shortlist[0].score}).`
    return {
      status: 'missing',
      code: null,
      label: null,
      confidence: 'low',
      alternatives: ordered.slice(0, 4).map(({ code, label, score }) => ({ code, label, score })),
      missingFacts: [...new Set([...clarifications, ...combinedMissingFacts, 'Validar clasificación antes de usar aranceles o economics'])].slice(0, 8),
      rationale: [
        'FAIL-CLOSED: la evidencia no alcanza para promover una NCM. Un candidato LOW nunca alimenta aranceles, impuestos ni economics.',
        ...(allowedChapterPrefixes(facts) ? [`Family gate activo: candidatos limitados al capítulo ${allowedChapterPrefixes(facts)?.join('/')}.`] : []),
        ...(concepts.exclusions.length ? [`Evidencia negativa aplicada: ${concepts.exclusions.join(' ')}`] : []),
        ...(reason ? [reason] : []),
        `Retrieval determinístico: ${shortlist[0].code} score ${shortlist[0].score}.`,
        ...(top.code !== shortlist[0].code ? [`AI rerank discrepó y propuso ${top.code}; la discrepancia queda bloqueada.`] : []),
      ],
      searchTerms,
      sourceDate: index.meta.sourceDate,
      source: index.meta.source,
      catalogRecordCount: index.meta.recordCount,
      retrievalMode: 'missing',
      tariff: null,
      diagnostics: buildDiagnostics(concepts, searchTerms, exclusionTerms, ordered, confidenceReason, combinedMissingFacts[0] ?? 'confianza insuficiente'),
    }
  }

  const tariff = tariffForCode(index, top.code)
  return {
    status: 'candidate',
    code: top.code,
    label: top.label,
    confidence,
    alternatives: ordered.slice(1, 4).map(({ code, label, score }) => ({ code, label, score })),
    missingFacts: combinedMissingFacts,
    rationale: [
      'El candidato pertenece a la snapshot oficial ARCA; el modelo sólo pudo reordenar códigos de la shortlist determinística.',
      ...(allowedChapterPrefixes(facts) ? [`Family gate activo: candidatos limitados al capítulo ${allowedChapterPrefixes(facts)?.join('/')}.`] : []),
      ...(concepts.exclusions.length ? [`Evidencia negativa aplicada: ${concepts.exclusions.join(' ')}`] : []),
      ...(tariff ? ['Tarifa NCM_APP aplicada automáticamente para economics de screening.'] : []),
      ...(reason ? [reason] : []),
      `Retrieval determinístico: ${shortlist[0].code} score ${shortlist[0].score}.`,
      ...(top.code !== shortlist[0].code ? [`AI rerank seleccionó ${top.code} dentro de la shortlist permitida.`] : []),
    ],
    searchTerms,
    sourceDate: index.meta.sourceDate,
    source: index.meta.source,
    catalogRecordCount: index.meta.recordCount,
    retrievalMode: ranked.ranking.length ? 'ai_reranked' : 'deterministic_fallback',
    tariff,
    diagnostics: buildDiagnostics(concepts, searchTerms, exclusionTerms, ordered, `Confianza ${confidence}: AI y retrieval determinístico coinciden en ${top.code}.`, combinedMissingFacts[0] ?? null),
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
      if (!data?.meta || ![3, 4].includes(data.meta.indexSchema) || !Array.isArray(data.records) || data.records.length < 10000) {
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
