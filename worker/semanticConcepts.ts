// Deterministic, language-independent semantic normalization for customs classification.
//
// This layer transforms noisy supplier/commercial product evidence (English, Spanish or
// mixed) into tariff-relevant concepts BEFORE any AI call. It is the language-invariance
// floor: even when the Cloudflare AI expansion degrades or returns nothing, the concepts
// derived here still carry Spanish customs vocabulary into retrieval and still express the
// negative/exclusion evidence that eliminates contradicted tariff families.
//
// Design rules (see the classification core principle):
//   - It NEVER emits NCM/HS/tariff codes. It only produces vocabulary and structured facts.
//   - Positive concepts add Spanish retrieval terms; negative evidence adds exclusion tokens.
//   - Exclusions come ONLY from EXPLICIT negative statements in the evidence, never from the
//     mere absence of a positive fact. Absence is uncertainty, not a contradiction.
//   - The concept lexicon is concept-based and compact, not a per-product dictionary. Adding
//     a product family here is adding a concept, not hardcoding a URL or a code.

export type NcmProductFactsLike = {
  name?: string | null
  category?: string | null
  material?: string | null
  functionText?: string | null
  description?: string | null
}

export type SemanticConcepts = {
  // Spanish customs/product nouns and short phrases describing what the product IS.
  positiveTerms: string[]
  // Spanish label tokens/substrings that, if present in a candidate label, contradict the
  // product and must be penalized during retrieval.
  exclusionTerms: string[]
  // Structured, human-inspectable normalized facts (observability + downstream logic).
  material: string | null
  functionText: string | null
  construction: string | null
  activeMechanism: 'electric' | 'mechanical' | 'passive' | null
  householdUse: boolean | null
  // Canonical concept keys that fired (for observability and concept-based shortcuts).
  concepts: string[]
  // Human-readable exclusion reasons (observability, never chain-of-thought).
  exclusions: string[]
  // A safe, ShippingAPP-derived normalized product category (never a supplier assertion).
  derivedCategory: string | null
}

function normalize(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function factsText(facts: NcmProductFactsLike) {
  return normalize([facts.name, facts.category, facts.material, facts.functionText, facts.description]
    .filter(Boolean)
    .join(' · '))
}

// A polar concept can be asserted (positive) or explicitly denied (negative). When denied,
// its terms flip to exclusions so retrieval penalizes families that require the concept.
type PolarConcept = {
  key: string
  positive: RegExp[]
  negative: RegExp[]
  // Terms contributed to retrieval when the concept is asserted.
  positiveTerms: string[]
  // Label tokens/substrings penalized when the concept is explicitly denied.
  exclusionTerms: string[]
  construction?: string
  activeMechanism?: SemanticConcepts['activeMechanism']
  positiveReason?: string
  negativeReason: string
}

// A simple (non-polar) concept: presence contributes vocabulary + structured facts.
type PlainConcept = {
  key: string
  match: RegExp[]
  positiveTerms: string[]
  material?: string
  functionText?: string
  activeMechanism?: SemanticConcepts['activeMechanism']
  householdUse?: boolean
}

// ---- Polar concepts (assertion vs explicit negation) -----------------------------------

const POLAR_CONCEPTS: PolarConcept[] = [
  {
    key: 'vacuum_insulated',
    // "thermal insulation: none", "non-insulated", "sin aislamiento", "no vacuum" → denied.
    negative: [
      /\b(thermal\s+)?insulation[^.,;]{0,20}\b(none|no|nil)\b/,
      /\bnon[-\s]?insulat/,
      /\bnot\s+insulated/,
      /\bno\s+(thermal\s+)?insulat/,
      /\bno\s+(vacuum|vacio)/,
      /\bsin\s+aislamiento/,
      /\baislamiento[^.,;]{0,12}\b(no|ninguno|none|nula?)\b/,
      /\bno\s+isotermic/,
    ],
    positive: [
      /\bvacuum[-\s]?insulat/,
      /\bdouble[-\s]?wall/,
      /\bdoble\s+pared/,
      /\bthermal\s+insulat/,
      /\bisotermic/,
      /\baislad[oa]\s+(al|por)\s+vacio/,
      /\bvacuum\s+flask/,
      /\bthermos\b/,
      /\btermo\b/,
      /\bmantiene\s+(la\s+)?temperatura/,
      /\bkeeps?\s+(hot|cold|drinks|beverages|temperature)/,
    ],
    positiveTerms: ['termo', 'isotermico', 'aislado por vacio', 'recipiente isotermico', 'aislado'],
    exclusionTerms: ['isotermic', 'aislad', 'vacio', 'termo'],
    construction: 'vacuum_insulated',
    positiveReason: 'Evidencia de aislamiento térmico / doble pared al vacío.',
    negativeReason: 'Evidencia explícita de que NO es isotérmico / sin aislamiento al vacío: se penalizan las partidas de termos y recipientes isotérmicos.',
  },
  {
    key: 'active_refrigeration',
    negative: [
      /\bno\s+refriger/,
      /\bsin\s+refriger/,
      /\bnot\s+refrigerated/,
      /\bno\s+(active\s+)?cooling/,
      /\bno\s+active\s+cool/,
      /\bpassive\b/,
      /\bpasivo\b/,
    ],
    positive: [
      /\bactive\s+cooling/,
      /\bcompressor\b/,
      /\bcompresor\b/,
      /\brefrigerat(ion|ed)\b/,
      /\bsistema\s+de\s+refrigeracion/,
    ],
    positiveTerms: ['refrigeracion', 'sistema de refrigeracion'],
    exclusionTerms: ['refriger', 'compresor', 'fluido refrigerante'],
    activeMechanism: 'electric',
    negativeReason: 'Evidencia explícita de que NO hay refrigeración activa (contenedor pasivo): se penalizan las máquinas y aparatos de refrigeración.',
  },
  {
    key: 'electric',
    negative: [
      /\bnon[-\s]?electric/,
      /\bnot\s+electric/,
      /\bno\s+electric/,
      /\bno\s+es\s+electric/,
      /\bsin\s+electricidad/,
      /\bno\s+electric[oa]/,
    ],
    positive: [
      /\belectric(al|o|a)?\b/,
      /\brechargeable\b/,
      /\brecargable\b/,
      /\bmotor\b/,
      /\bplug\b/,
      /\benchufe\b/,
      /\bvoltaj/,
      /\bvoltage\b/,
      /\bwatt/,
      /\b\d+\s?w\b/,
    ],
    positiveTerms: ['electrico'],
    exclusionTerms: ['electric', 'electrotermic', 'electromecanic'],
    activeMechanism: 'electric',
    negativeReason: 'Evidencia explícita de que NO es eléctrico: se penalizan las partidas de aparatos eléctricos.',
  },
  {
    key: 'corrective_eyewear',
    negative: [
      /\bnon[-\s]?corrective/,
      /\bnot\s+corrective/,
      /\bno\s+graduad/,
      /\bsin\s+graduacion/,
      /\bnon[-\s]?prescription/,
    ],
    positive: [
      /\bcorrective\b/,
      /\bprescription\b/,
      /\bgraduad[oa]/,
      /\bde\s+lectura\b/,
      /\breading\s+glasses/,
    ],
    positiveTerms: ['gafas correctoras', 'anteojos correctores'],
    exclusionTerms: ['correctora', 'graduad', 'de vista'],
    negativeReason: 'Evidencia explícita de anteojos no correctores: se penalizan las gafas correctoras/graduadas.',
  },
]

// ---- Plain concepts (material / function / identity vocabulary) -------------------------

const PLAIN_CONCEPTS: PlainConcept[] = [
  // Materials
  { key: 'material_stainless_steel', match: [/\bstainless\s+steel\b/, /\binox\b/, /\bacero\s+inoxidable\b/, /\bss304\b/, /\b304\s+steel\b/], positiveTerms: ['acero inoxidable', 'metal comun'], material: 'acero inoxidable' },
  { key: 'material_plastic', match: [/\bplastic\b/, /\bplastico\b/, /\bpolypropylene\b/, /\bpolipropileno\b/, /\bpolyethylene\b/, /\bpolietileno\b/, /\b(pp|hdpe|ldpe|pet|abs|tritan)\b/], positiveTerms: ['plastico', 'de plastico'], material: 'plastico' },
  { key: 'material_glass', match: [/\bglass\b/, /\bvidrio\b/, /\bborosilicate\b/, /\bborosilicato\b/], positiveTerms: ['vidrio', 'de vidrio'], material: 'vidrio' },
  { key: 'material_aluminium', match: [/\baluminium\b/, /\baluminum\b/, /\baluminio\b/], positiveTerms: ['aluminio'], material: 'aluminio' },
  { key: 'material_textile', match: [/\btextile\b/, /\btextil\b/, /\bpolyester\b/, /\bpoliester\b/, /\bnylon\b/, /\bfabric\b/, /\btela\b/], positiveTerms: ['materia textil', 'textil'], material: 'textil' },
  { key: 'material_rubber', match: [/\brubber\b/, /\bcaucho\b/, /\bsilicone\b/, /\bsilicona\b/], positiveTerms: ['caucho'], material: 'caucho' },

  // Function / identity families (Spanish tariff vocabulary aligned with official labels)
  {
    key: 'beverage_container',
    match: [/\bbottle\b/, /\bbotella\b/, /\bflask\b/, /\btumbler\b/, /\bmug\b/, /\bcup\b/, /\bvaso\b/, /\btaza\b/, /\bdrink(ing|ware)?\b/, /\bbeber\b/, /\bbebidas?\b/, /\bwater\s+bottle\b/, /\bstraw\b/, /\bsorbete\b/, /\bcantimplora\b/, /\b\d+\s?(oz|ml|l|litros?|liter)\b/],
    positiveTerms: ['recipiente', 'botella', 'para bebidas', 'articulos de uso domestico'],
    functionText: 'recipiente para bebidas',
    householdUse: true,
    activeMechanism: 'passive',
  },
  {
    key: 'sunglasses',
    match: [/\bsunglasses?\b/, /\bgafas\s+de\s+sol\b/, /\banteojos\s+de\s+sol\b/, /\bshades\b/, /\buv400\b/, /\blentes\s+de\s+sol\b/],
    positiveTerms: ['gafas de sol', 'anteojos de sol', 'gafas', 'anteojos'],
    functionText: 'proteger los ojos del sol',
  },
  {
    key: 'footwear',
    match: [/\bshoes\b/, /\bfootwear\b/, /\bsneakers\b/, /\bzapatillas\b/, /\bcalzado\b/, /\bzapatos\b/],
    positiveTerms: ['calzado'],
    functionText: 'calzado',
  },
  {
    key: 'backpack',
    match: [/\bbackpack\b/, /\bmochila\b/, /\brucksack\b/, /\bbolso\b/],
    positiveTerms: ['mochila', 'bolso', 'continente similar'],
    functionText: 'transportar objetos personales',
  },
  {
    key: 'headphones',
    match: [/\bheadphones?\b/, /\bearbuds?\b/, /\bauriculares?\b/, /\bear\s?phones?\b/, /\btws\b/],
    positiveTerms: ['auriculares'],
    functionText: 'reproducir audio',
    activeMechanism: 'electric',
  },
  {
    key: 'battery_lithium',
    match: [/\blithium\b/, /\bli-?ion\b/, /\bbattery\b/, /\bbateria\b/, /\bacumulador\b/, /\b18650\b/],
    positiveTerms: ['acumulador de litio', 'bateria de litio'],
    functionText: 'acumular energía eléctrica',
    activeMechanism: 'electric',
  },
  {
    key: 'power_adapter',
    match: [/\bcharger\b/, /\bcargador\b/, /\bpower\s+adapter\b/, /\badaptador\b/, /\bfuente\s+de\s+alimentacion\b/],
    positiveTerms: ['convertidor electrico estatico', 'fuente de alimentacion'],
    functionText: 'convierte corriente eléctrica',
    activeMechanism: 'electric',
  },
]

function matchAny(patterns: RegExp[], text: string) {
  return patterns.some((pattern) => pattern.test(text))
}

/**
 * Derive language-independent tariff concepts from raw product evidence.
 * Deterministic and side-effect free; safe to call before or instead of the AI expansion.
 */
export function deriveSemanticConcepts(facts: NcmProductFactsLike): SemanticConcepts {
  const text = factsText(facts)

  const positiveTerms = new Set<string>()
  const exclusionTerms = new Set<string>()
  const exclusions: string[] = []
  const concepts: string[] = []
  // Canonical (Spanish) material derived from concepts takes precedence; the raw supplier
  // material string is only a fallback so downstream logic sees a normalized value.
  let conceptMaterial: string | null = null
  let functionText: string | null = facts.functionText ? facts.functionText.trim() : null
  let construction: string | null = null
  let activeMechanism: SemanticConcepts['activeMechanism'] = null
  let householdUse: boolean | null = null

  // Polar concepts first: explicit negation flips terms into exclusions and suppresses the
  // positive assertion (this is what distinguishes an insulated thermo from a plain bottle
  // whose spec literally says "thermal insulation: none").
  for (const concept of POLAR_CONCEPTS) {
    const denied = matchAny(concept.negative, text)
    if (denied) {
      for (const term of concept.exclusionTerms) exclusionTerms.add(term)
      exclusions.push(`${concept.key}: ${concept.negativeReason}`)
      concepts.push(`!${concept.key}`)
      if (concept.key === 'active_refrigeration' || concept.key === 'electric') activeMechanism = activeMechanism ?? 'passive'
      continue
    }
    if (matchAny(concept.positive, text)) {
      for (const term of concept.positiveTerms) positiveTerms.add(term)
      concepts.push(concept.key)
      if (concept.construction) construction = concept.construction
      if (concept.activeMechanism) activeMechanism = concept.activeMechanism
    }
  }

  // Plain concepts: material / function / identity vocabulary.
  for (const concept of PLAIN_CONCEPTS) {
    if (!matchAny(concept.match, text)) continue
    for (const term of concept.positiveTerms) positiveTerms.add(term)
    concepts.push(concept.key)
    if (concept.material && !conceptMaterial) conceptMaterial = concept.material
    if (concept.functionText && !functionText) functionText = concept.functionText
    // Only set an electric mechanism if it wasn't explicitly denied above.
    if (concept.activeMechanism === 'electric' && activeMechanism !== 'passive') activeMechanism = 'electric'
    else if (concept.activeMechanism && !activeMechanism) activeMechanism = concept.activeMechanism
    if (typeof concept.householdUse === 'boolean' && householdUse === null) householdUse = concept.householdUse
  }

  const material = conceptMaterial ?? (facts.material ? facts.material.trim() : null)

  return {
    positiveTerms: [...positiveTerms],
    exclusionTerms: [...exclusionTerms],
    material,
    functionText,
    construction,
    activeMechanism,
    householdUse,
    concepts,
    exclusions,
    derivedCategory: deriveNormalizedCategory(facts, {
      concepts,
      material,
      construction,
    }),
  }
}

/**
 * Derive a safe, human-readable normalized product category from evidence. This is an
 * explicitly ShippingAPP-DERIVED classification, never a supplier assertion — callers must
 * tag its provenance accordingly. Returns null when the evidence does not clearly describe
 * a product (fail-closed: better to ask than to invent).
 */
export function deriveNormalizedCategory(
  facts: NcmProductFactsLike,
  hint?: { concepts?: string[]; material?: string | null; construction?: string | null },
): string | null {
  // When called without a hint, derive the full concept set so material/construction are
  // available (deriveSemanticConcepts passes an explicit hint to avoid infinite recursion).
  const resolved = hint ?? (() => {
    const c = deriveSemanticConcepts(facts)
    return { concepts: c.concepts, material: c.material, construction: c.construction }
  })()
  const concepts = resolved.concepts ?? []
  const material = resolved.material ?? null
  const construction = resolved.construction ?? null
  const has = (key: string) => concepts.includes(key)
  const denied = (key: string) => concepts.includes(`!${key}`)

  const materialWord = material === 'acero inoxidable' ? 'de acero inoxidable'
    : material === 'plastico' ? 'de plástico'
      : material === 'vidrio' ? 'de vidrio'
        : material === 'aluminio' ? 'de aluminio'
          : ''

  if (has('beverage_container')) {
    if (construction === 'vacuum_insulated' && !denied('vacuum_insulated')) {
      return `Termo / recipiente isotérmico ${materialWord}`.replace(/\s+/g, ' ').trim()
    }
    const base = materialWord ? `Botella reutilizable ${materialWord}` : 'Botella reutilizable para bebidas'
    return base.replace(/\s+/g, ' ').trim()
  }
  if (has('sunglasses')) return 'Anteojos de sol'
  if (has('footwear')) return 'Calzado'
  if (has('backpack')) return 'Mochila / bolso'
  if (has('headphones')) return 'Auriculares'
  if (has('battery_lithium')) return 'Acumulador de litio'
  if (has('power_adapter')) return 'Fuente de alimentación / cargador'

  return null
}

export type Clarification = {
  // Direct, product-specific, answerable question in Spanish.
  question: string
  // The structured product fact the answer maps to (reused across continuation attempts).
  fact: 'construction' | 'material' | 'activeMechanism' | 'function'
}

/**
 * Derive specific clarification questions, asked ONLY when the answer can materially change
 * the tariff classification. Every question maps to a structured fact so a continuation
 * attempt can reuse the answer (and it costs no extra credit within the same reservation).
 * Returns [] when the evidence is already sufficient to classify or when no question would
 * change the outcome — this avoids dead-end clarification loops and silly generic questions.
 */
export function deriveClarifications(concepts: SemanticConcepts): Clarification[] {
  const has = (key: string) => concepts.concepts.includes(key)
  const clarifications: Clarification[] = []

  // Insulation decides between the isothermal-container family and ordinary drinkware — but
  // only ask when the evidence neither asserts nor denies it. If it is already asserted or
  // explicitly denied, the classifier does not need to ask.
  if (has('beverage_container') && !has('vacuum_insulated') && !has('!vacuum_insulated')) {
    clarifications.push({
      question: '¿El recipiente tiene aislamiento térmico / doble pared al vacío (termo isotérmico) o es una botella común sin aislamiento?',
      fact: 'construction',
    })
  }

  // For eyewear, whether the lenses are corrective (graduadas) changes the tariff opening.
  if (has('sunglasses') && !has('corrective_eyewear') && !has('!corrective_eyewear')) {
    clarifications.push({
      question: '¿Los anteojos son sólo de sol (no correctores) o tienen lentes graduadas/correctoras?',
      fact: 'function',
    })
  }

  return clarifications
}

