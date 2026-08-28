import { ncmAppTariffOverride } from './ncmTariffOverrides'
import { deterministicCustomsTerms, hasAccessoryIntent } from './ncmVocabulary'

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
}

type AI = { run: (model: string, input: unknown) => Promise<unknown> }
type AiExpansion = { searchTerms: string[]; missingFacts: string[] }
type AiRanking = { ranking: Array<{ code: string; reason?: string }>; confidence?: 'high' | 'medium' | 'low'; missingFacts?: string[]; attempted: boolean }

const STOPWORDS = new Set([
  'de','del','la','las','el','los','un','una','unos','unas','y','o','e','para','por','con','sin','en','al','se','su','sus','que','como','tipo','otro','otra','dema',
  'the','of','and','or','for','with','without','in','a','an','to','other','product','producto','articulo','material','equipment','equipo','sale','hot','new','oem','odm',
])

const ACCESSORY_LABEL = /\b(parte|partes|accesorio|accesorios|funda|fundas|cubierta|cubiertas|pantalla|pantallas|cierre|cremallera|repuesto|repuestos|part|parts|accessory|cover|case|shade|zipper)\b/

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
  // Keep English/Spanish nouns useful across marketplace and customs wording.
  // Generic "...es" trimming breaks smartphones/inteligentes, two words that
  // matter directly for 8517.13, so treat those plural families conservatively.
  if (token.length > 5 && (token.endsWith('ntes') || token.endsWith('phones'))) token = token.slice(0, -1)
  else if (token.length > 6 && token.endsWith('es') && !token.endsWith('ies')) token = token.slice(0, -2)
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
    .filter((value) => value.length >= 3 && value.length <= 180)
    .filter((value) => !/\b\d{4}[.]?\d{2}[.]?\d{2}\b/.test(value))
  )].slice(0, 32)
}

function factsText(facts: NcmProductFacts) {
  return [facts.name, facts.category, facts.material, facts.functionText, facts.description].filter(Boolean).join(' ')
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
  if (!row || typeof row[1] !== 'string' || !row[1].trim()) return null
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
      'Identidad de producto resuelta de forma determinística y validada contra una posición existente en NCM_APP; no se inventa ningún código.',
      ...(official.tariff ? ['Tarifa tomada de la misma fila exacta de NCM_APP para el screening económico.'] : []),
      rationale,
    ],
    sourceDate: index.meta.sourceDate,
    source: index.meta.source,
    catalogRecordCount: index.meta.recordCount,
    retrievalMode: 'deterministic_fallback',
    tariff: official.tariff,
  }
}

type KnownRule = {
  code: string
  terms: string[]
  rationale: string
  test: (text: string) => boolean
}

function has(text: string, pattern: RegExp) { return pattern.test(text) }

function deterministicKnownNcm(index: NcmSearchIndex, facts: NcmProductFacts): FullNcmClassification | null {
  const text = normalizeText(factsText(facts))
  if (!text || hasAccessoryIntent(facts)) return null

  const noAdapterCable = has(text, /\b(cable|cord|conductor)\b/) && has(text, /\b(no|without|sin)\b.{0,30}\b(adapter|charger|adaptador|cargador)\b/)
  const tableTennis = has(text, /\b(table tennis|ping pong|tenis de mesa)\b/)

  const rules: KnownRule[] = [
    { code: '9506.59.00', terms: ['padel', 'raqueta', 'racket'], rationale: 'Artículo identificado como raqueta/paleta completa para pádel.', test: (t) => has(t, /\b(padel|paddle)\b/) && has(t, /\b(racket|racquet|raqueta|paleta|pala)\b/) },
    { code: '9506.51.00', terms: ['tenis', 'raqueta', 'tennis racket'], rationale: 'Artículo identificado como raqueta completa de tenis.', test: (t) => !tableTennis && has(t, /\b(tennis|tenis)\b/) && has(t, /\b(racket|racquet|raqueta)\b/) },
    { code: '9506.40.00', terms: ['tenis de mesa', 'ping pong'], rationale: 'Artículo identificado como material para tenis de mesa.', test: (t) => tableTennis },
    { code: '8504.40.90', terms: ['cargador', 'power adapter', 'convertidor estatico'], rationale: 'Artículo identificado como cargador/adaptador de alimentación completo.', test: (t) => !noAdapterCable && has(t, /\b(charger|wall charger|power adapter|ac dc adapter|cargador|adaptador de corriente|fuente de alimentacion)\b/) },
    { code: '8507.60.00', terms: ['bateria', 'lithium ion', 'iones de litio'], rationale: 'Artículo identificado como acumulador/batería recargable de ion-litio.', test: (t) => has(t, /\b(lithium|litio|18650|li ion|li ion)\b/) && has(t, /\b(battery|bateria|accumulator|acumulador|battery pack)\b/) },
    { code: '8517.13.00', terms: ['smartphone', 'telefono inteligente'], rationale: 'Artículo identificado como teléfono inteligente.', test: (t) => has(t, /\b(smartphone|smart phone|telefono inteligente)\b/) || (has(t, /\b(android|ios)\b/) && has(t, /\b(mobile phone|cell phone|telefono celular)\b/)) },
    { code: '9405.21.00', terms: ['lampara de mesa', 'desk lamp', 'led'], rationale: 'Artículo identificado como lámpara eléctrica LED de mesa/escritorio.', test: (t) => has(t, /\b(led)\b/) && has(t, /\b(desk lamp|table lamp|reading lamp|reading light|lampara de mesa|lampara escritorio)\b/) },
    { code: '4202.92.00', terms: ['mochila', 'backpack'], rationale: 'Artículo identificado como mochila/bolso de uso personal.', test: (t) => has(t, /\b(backpack|rucksack|school bag|mochila)\b/) },
    { code: '8471.30.19', terms: ['notebook', 'laptop', 'computadora portatil'], rationale: 'Artículo identificado como computadora portátil/notebook.', test: (t) => has(t, /\b(laptop|notebook|notebook computer|portable computer|computadora portatil)\b/) },
    { code: '8544.42.00', terms: ['cable', 'usb c', 'conectores'], rationale: 'Artículo identificado como conductor/cable eléctrico provisto de conectores.', test: (t) => has(t, /\b(cable|conductor|cord)\b/) && has(t, /\b(usb|connector|connectors|conector|conectores|type c|usb c)\b/) },
    { code: '6109.10.00', terms: ['t shirt', 'camiseta', 'algodon'], rationale: 'Artículo identificado como camiseta de punto de algodón.', test: (t) => has(t, /\b(t shirt|tee shirt|camiseta)\b/) && has(t, /\b(cotton|algodon)\b/) },
    { code: '6404.11.00', terms: ['calzado deportivo', 'sports shoes', 'textil'], rationale: 'Artículo identificado como calzado deportivo con parte superior textil.', test: (t) => has(t, /\b(running shoes|sports shoes|sneakers|trainers|zapatillas|calzado deportivo)\b/) && has(t, /\b(textile|mesh|fabric|textil|breathable)\b/) },
    { code: '8414.51.10', terms: ['ventilador de mesa', 'table fan'], rationale: 'Artículo identificado como ventilador eléctrico de mesa de baja potencia.', test: (t) => has(t, /\b(table fan|desk fan|ventilador de mesa)\b/) && !has(t, /\b(industrial|industrial fan)\b/) },
    { code: '8516.60.00', terms: ['horno electrico', 'electric oven'], rationale: 'Artículo identificado como horno/aparato eléctrico doméstico para cocción.', test: (t) => has(t, /\b(electric oven|countertop oven|baking oven|horno electrico)\b/) },
    { code: '6302.60.00', terms: ['toalla', 'algodon', 'terry towel'], rationale: 'Artículo identificado como toalla de algodón de tejido con bucles.', test: (t) => has(t, /\b(towel|toalla)\b/) && has(t, /\b(cotton|algodon|terry)\b/) },
    { code: '6912.00.00', terms: ['vajilla', 'ceramica', 'tableware'], rationale: 'Artículo identificado como vajilla/artículo doméstico de cerámica.', test: (t) => has(t, /\b(ceramic|ceramica)\b/) && has(t, /\b(tableware|dinnerware|plate|bowl|mug|vajilla|plato|taza)\b/) },
    { code: '8421.21.00', terms: ['filtro de agua', 'water purifier'], rationale: 'Artículo identificado como aparato para filtrar o depurar agua.', test: (t) => has(t, /\b(water filter|water purifier|reverse osmosis|filtro de agua|purificador de agua)\b/) },
    { code: '9019.10.00', terms: ['aparato para masajes', 'massage gun'], rationale: 'Artículo identificado como aparato para masajes/mecanoterapia.', test: (t) => has(t, /\b(massage gun|percussion massager|muscle massager|pistola de masaje|masajeador)\b/) },
    { code: '7323.93.00', terms: ['acero inoxidable', 'uso domestico'], rationale: 'Artículo identificado como artículo doméstico/de cocina de acero inoxidable.', test: (t) => has(t, /\b(stainless steel|acero inoxidable)\b/) && has(t, /\b(kitchen|household|mixing bowl|bowl|cocina|domestico)\b/) },
    { code: '8518.30.00', terms: ['auriculares', 'headphones', 'earbuds'], rationale: 'Artículo identificado como auriculares/earbuds.', test: (t) => has(t, /\b(headphones|headphone|earbuds|earbud|earphones|earphone|tws|auricular|auriculares)\b/) },
    { code: '8518.21.00', terms: ['altavoz', 'speaker'], rationale: 'Artículo identificado como altavoz/parlante individual portátil.', test: (t) => has(t, /\b(portable speaker|bluetooth speaker|wireless speaker|parlante|altavoz)\b/) },
    { code: '8528.69.00', terms: ['proyector', 'projector'], rationale: 'Artículo identificado como proyector de imagen no incorporando receptor de TV.', test: (t) => has(t, /\b(mini projector|projector|proyector)\b/) && !has(t, /\b(part|replacement|lens only)\b/) },
    { code: '8509.40.50', terms: ['licuadora', 'blender'], rationale: 'Artículo identificado como licuadora/mezcladora electromecánica doméstica.', test: (t) => has(t, /\b(blender|liquidizer|licuadora)\b/) },
    { code: '8508.11.00', terms: ['aspiradora', 'vacuum cleaner'], rationale: 'Artículo identificado como aspiradora eléctrica doméstica.', test: (t) => has(t, /\b(vacuum cleaner|pet grooming vacuum|aspiradora)\b/) },
    { code: '9004.10.00', terms: ['gafas de sol', 'sunglasses'], rationale: 'Artículo identificado como gafas/anteojos de sol.', test: (t) => has(t, /\b(sunglasses|gafas de sol|anteojos de sol)\b/) },
    { code: '8516.71.00', terms: ['cafetera', 'coffee maker'], rationale: 'Artículo identificado como aparato eléctrico para preparar café o té.', test: (t) => has(t, /\b(coffee maker|coffee machine|espresso machine|cafetera)\b/) },
    { code: '8541.43.00', terms: ['panel solar', 'photovoltaic'], rationale: 'Artículo identificado como módulo/panel fotovoltaico.', test: (t) => has(t, /\b(solar panel|photovoltaic panel|pv panel|panel solar|panel fotovoltaico)\b/) },
    { code: '8471.60.52', terms: ['teclado', 'keyboard'], rationale: 'Artículo identificado como teclado/unidad de entrada de datos.', test: (t) => has(t, /\b(keyboard|teclado)\b/) && !has(t, /\b(case|cover|keycap|replacement)\b/) },
    { code: '8471.60.53', terms: ['mouse', 'computer mouse'], rationale: 'Artículo identificado como mouse/unidad de entrada de datos.', test: (t) => has(t, /\b(computer mouse|wireless mouse|optical mouse|mouse inalambrico)\b/) },
    { code: '9617.00.10', terms: ['termo', 'thermal bottle'], rationale: 'Artículo identificado como recipiente isotérmico/termo completo.', test: (t) => has(t, /\b(thermal bottle|vacuum flask|insulated bottle|thermos|botella termica|termo)\b/) },
    { code: '8516.10.00', terms: ['calentador de agua', 'water heater'], rationale: 'Artículo identificado como calentador eléctrico de agua.', test: (t) => has(t, /\b(electric water heater|storage water heater|water heater|termotanque|calentador de agua)\b/) },
  ]

  for (const rule of rules) {
    if (!rule.test(text)) continue
    const official = findOfficial(index, rule.code)
    if (official) return shortcutClassification(index, official, rule.terms, rule.rationale)
  }

  // A couple of broad-but-safe fallbacks remain useful when the current source
  // has a family label but marketplace wording varies more than a fixed rule.
  const isCamera = ['camara', 'camera', 'security camera', 'ip camera', 'wifi camera'].some((term) => text.includes(normalizeText(term)))
  if (isCamera) {
    const official = findOfficial(index, '8525.89.19')
      || findOfficialByLabel(index, '8525.', ['camara'])
      || findOfficialByLabel(index, '8525.', ['camaras'])
      || findOfficialByPrefix(index, '8525.')
    if (official) return shortcutClassification(index, official, ['camara', 'ip', 'security camera'], 'Producto identificado como cámara IP/digital de seguridad.')
  }

  return null
}

function labelHasAccessorySignal(label: string) {
  return ACCESSORY_LABEL.test(normalizeText(label))
}

export function retrieveNcmCandidates(index: NcmSearchIndex, searchTerms: string[], facts: NcmProductFacts, limit = 25): NcmRetrievalCandidate[] {
  if (!index || ![3, 4].includes(index.meta.indexSchema) || !Array.isArray(index.records)) return []
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

  const accessoryIntent = hasAccessoryIntent(facts)
  const scored: NcmRetrievalCandidate[] = []
  for (const row of index.records) {
    if (!Array.isArray(row) || row.length < 2) continue
    const [code, label] = row
    if (!/^\d{4}\.\d{2}\.\d{2}$/.test(code) || typeof label !== 'string' || !label.trim()) continue
    if (accessoryIntent && !labelHasAccessorySignal(label)) continue

    const normalizedLabel = normalizeText(label)
    const labelTokens = new Set(tokens(normalizedLabel))
    const matchedTerms: string[] = []
    let score = 0

    for (const phrase of phraseNorms) {
      if (phrase.split(' ').length >= 2 && normalizedLabel.includes(phrase)) {
        score += Math.min(34, 14 + phrase.length / 3)
        matchedTerms.push(phrase)
      }
    }
    for (const token of queryTokens) {
      if (!labelTokens.has(token)) continue
      const weight = token.length >= 9 ? 9 : token.length >= 6 ? 6 : 3
      score += weight
      matchedTerms.push(token)
    }

    if (score >= 8 && new Set(matchedTerms).size >= 2) {
      scored.push({ code, label, score: Math.round(score * 100) / 100, matchedTerms: [...new Set(matchedTerms)] })
    }
  }

  return scored.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code)).slice(0, Math.max(1, Math.min(50, limit)))
}

async function expandSearchTerms(ai: AI, facts: NcmProductFacts): Promise<AiExpansion> {
  try {
    const result: any = await ai.run('@cf/zai-org/glm-4.7-flash', {
      messages: [
        { role: 'system', content: 'You prepare search vocabulary for Argentina customs nomenclature retrieval. Return JSON only: {"searchTerms":[...],"missingFacts":[...]}. searchTerms must be Spanish customs/product nouns or short phrases describing what the product IS, its principal function, material/composition and important technical nature. Include useful synonyms/translations from English marketplace language. NEVER output HS, NCM, tariff or numeric classification codes. Do not guess missing technical facts. Preserve whether the listing is a complete product, accessory, replacement part, cover, case or component.' },
        { role: 'user', content: JSON.stringify(facts) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_completion_tokens: 350,
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
  const seen = new Set<string>()
  const ranking: Array<{ code: string; reason?: string }> = []
  for (const item of Array.isArray(parsed?.ranking) ? parsed.ranking : []) {
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
    const result: any = await ai.run('@cf/zai-org/glm-4.7-flash', {
      messages: [
        { role: 'system', content: 'You rerank ONLY the supplied Argentina NCM candidates. Return JSON only: {"ranking":[{"code":"EXACT_ALLOWED_CODE","reason":"short reason"}],"confidence":"high|medium|low","missingFacts":[...]}. Never create a code. If product facts are insufficient, still rank only allowed codes but use low confidence and explain missing facts. Classification depends on objective product characteristics/function, never origin country, price or intended profit. Never turn a cover, case, replacement part, component or accessory into the complete parent product.' },
        { role: 'user', content: JSON.stringify({ product: facts, allowedCandidates: shortlist.map(({ code, label, score }) => ({ code, label, score })) }) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_completion_tokens: 550,
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
  const aiTopCode = ranked.ranking[0]?.code
  if (!aiTopCode || aiTopCode === deterministicTop.code) return deterministicTop
  if (deterministicConfidence(shortlist) === 'medium') return deterministicTop

  const aiTop = shortlist.find((candidate) => candidate.code === aiTopCode)
  if (!aiTop) return deterministicTop
  const gap = deterministicTop.score - aiTop.score
  return ranked.confidence === 'high' && gap <= 5 ? aiTop : deterministicTop
}

function deriveConfidence(shortlist: NcmRetrievalCandidate[], ranked: AiRanking, selected: NcmRetrievalCandidate): 'high' | 'medium' | 'low' {
  if (!shortlist.length) return 'low'
  const deterministicTop = shortlist[0]
  const aiTop = ranked.ranking[0]?.code
  const deterministic = deterministicConfidence(shortlist)

  if (!ranked.ranking.length) return ranked.attempted ? 'low' : (selected.code === deterministicTop.code ? deterministic : 'low')
  if (selected.code !== deterministicTop.code || aiTop !== deterministicTop.code || ranked.confidence === 'low') return 'low'
  if (deterministicTop.score >= 42 && scoreGap(shortlist) >= 12 && ranked.confidence === 'high') return 'high'
  return deterministic
}

export async function classifyFullNcm(index: NcmSearchIndex, ai: AI, facts: NcmProductFacts): Promise<FullNcmClassification> {
  const deterministic = deterministicKnownNcm(index, facts)
  if (deterministic) return deterministic

  const expansion = await expandSearchTerms(ai, facts)
  const deterministicTerms = deterministicCustomsTerms(facts)
  const originalTerms = safeTerms([facts.name || '', facts.category || '', facts.functionText || '', facts.material || '', facts.description || ''])
  const searchTerms = safeTerms([...deterministicTerms, ...expansion.searchTerms, ...originalTerms])
  const shortlist = retrieveNcmCandidates(index, searchTerms, facts, 25)
  if (!shortlist.length) {
    return {
      status: 'missing', code: null, label: null, confidence: 'missing', alternatives: [], tariff: null,
      missingFacts: [...new Set([...expansion.missingFacts, 'Describir con más precisión qué es el producto, su función principal y si es producto completo o accesorio.'])].slice(0, 8),
      rationale: ['NCM_APP no produjo una shortlist con evidencia textual suficiente; ShippingAPP se abstiene antes que inventar una posición.'],
      searchTerms,
      sourceDate: index.meta.sourceDate,
      source: index.meta.source,
      catalogRecordCount: index.meta.recordCount,
      retrievalMode: 'missing',
    }
  }

  const ranked = await rerankShortlist(ai, facts, shortlist)
  const top = chooseTop(shortlist, ranked)
  const confidence = deriveConfidence(shortlist, ranked, top)
  const reason = ranked.ranking.find((item) => item.code === top.code)?.reason
  const tariff = tariffForCode(index, top.code)
  const alternatives = shortlist
    .filter((candidate) => candidate.code !== top.code)
    .slice(0, 3)
    .map(({ code, label, score }) => ({ code, label, score }))

  return {
    status: 'candidate',
    code: top.code,
    label: top.label,
    confidence,
    alternatives,
    missingFacts: [...new Set([...expansion.missingFacts, ...(ranked.missingFacts || [])])].slice(0, 8),
    rationale: [
      'El candidato existe en la snapshot NCM_APP; el modelo sólo puede elegir entre códigos previamente recuperados del nomenclador oficial.',
      ...(tariff ? ['Tarifa NCM_APP aplicada únicamente desde la fila exacta del código seleccionado.'] : []),
      ...(reason ? [reason] : []),
      `Retrieval determinístico: ${shortlist[0].code} score ${shortlist[0].score}.`,
      ...(ranked.ranking[0]?.code && ranked.ranking[0].code !== shortlist[0].code ? [`AI sugirió ${ranked.ranking[0].code}; ${top.code === shortlist[0].code ? 'no desplazó evidencia determinística fuerte.' : 'sólo desplazó al primero por cercanía de score.'}`] : []),
      ...(!ranked.ranking.length ? [ranked.attempted
        ? 'La respuesta estructurada de AI no produjo un ranking utilizable; se conserva la evidencia determinística con confianza reducida.'
        : 'AI no estuvo disponible; la clasificación se basó sólo en evidencia determinística y no se eleva artificialmente la confianza.'] : []),
    ],
    searchTerms,
    sourceDate: index.meta.sourceDate,
    source: index.meta.source,
    catalogRecordCount: index.meta.recordCount,
    retrievalMode: ranked.ranking.length ? 'ai_reranked' : 'deterministic_fallback',
    tariff,
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
