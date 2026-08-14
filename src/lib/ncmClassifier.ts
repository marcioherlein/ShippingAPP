import { NCM_CATALOG, NCM_CATALOG_META, type NcmCatalogRow } from './ncmCatalog'

export type NcmProductFacts = {
  name?: string | null
  category?: string | null
  functionText?: string | null
  materialText?: string | null
}

export type NcmCandidate = {
  code: string
  description: string
  dutyRatePct: number | null
  score: number
  reasons: string[]
}

export type NcmClassification = {
  status: 'candidate' | 'missing'
  top: NcmCandidate | null
  alternatives: NcmCandidate[]
  confidence: 'high' | 'medium' | 'low' | 'missing'
  missingFacts: string[]
  rationale: string[]
  catalog: typeof NCM_CATALOG_META
}

function normalize(value: string | null | undefined) {
  return (value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function sourceText(facts: NcmProductFacts) {
  return normalize([facts.name, facts.category, facts.functionText, facts.materialText].filter(Boolean).join(' '))
}

function wordMatch(text: string, token: string) {
  const t = normalize(token)
  return text.includes(t)
}

function scoreRow(row: NcmCatalogRow, facts: NcmProductFacts): NcmCandidate {
  const text = sourceText(facts)
  const reasons: string[] = []
  let score = 0

  for (const keyword of row.keywords) {
    if (wordMatch(text, keyword)) {
      const points = keyword.length >= 7 ? 18 : 10
      score += points
      reasons.push(`Coincide con “${keyword}”.`)
    }
  }
  for (const hint of row.functionHints) {
    if (wordMatch(text, hint)) {
      score += 20
      reasons.push(`Función compatible: “${hint}”.`)
    }
  }
  for (const material of row.materialHints || []) {
    if (wordMatch(text, material)) {
      score += 5
      reasons.push(`Material compatible: “${material}”.`)
    }
  }
  for (const negative of row.negativeKeywords || []) {
    if (wordMatch(text, negative)) {
      score -= 45
      reasons.push(`Exclusión/competencia detectada: “${negative}”.`)
    }
  }

  // Specificity rules inside the pilot heading. They mimic the hierarchy of the
  // nomenclature instead of letting a generic keyword win by raw frequency.
  if (row.code === '9506.51.00' && /\btennis\b|\btenis\b/.test(text) && !/padel|badminton|pickleball/.test(text)) {
    score += 55
    reasons.push('La subpartida específica de raqueta de tenis tiene prioridad frente a residuales.')
  }
  if (row.code === '9506.59.00' && /padel|badminton|pickleball/.test(text) && /(racket|racquet|paddle|paleta|raqueta)/.test(text)) {
    score += 65
    reasons.push('Deporte de raqueta similar distinto de tenis: candidato residual específico 9506.59.00.')
  }
  if (row.code === '9506.40.00' && /(table tennis|tenis de mesa|ping pong)/.test(text)) {
    score += 70
    reasons.push('Tenis de mesa tiene subpartida propia y no debe caer en “raquetas similares”.')
  }
  if (row.code === '9506.99.00' && /(racket|racquet|paddle|paleta|raqueta)/.test(text)) {
    score -= 25
    reasons.push('La posición residual general pierde prioridad frente a una subpartida específica de raquetas.')
  }

  return { code: row.code, description: row.description, dutyRatePct: row.dutyRatePct, score, reasons }
}

function missingFactsFor(facts: NcmProductFacts, top: NcmCandidate | null) {
  const missing: string[] = []
  const text = sourceText(facts)
  if (!facts.name && !facts.category) missing.push('Identidad o categoría del producto')
  if (!facts.functionText && !/(padel|tennis|tenis|badminton|pickleball|table tennis|tenis de mesa|ping pong|gym|fitness|athletics)/.test(text)) {
    missing.push('Función/uso principal')
  }
  if (top?.code === '9506.59.00' && !/(racket|racquet|paddle|paleta|raqueta)/.test(text)) {
    missing.push('Confirmar que el artículo es una raqueta/paleta deportiva y no un accesorio')
  }
  return missing
}

export function classifyNcm(facts: NcmProductFacts): NcmClassification {
  const ranked = NCM_CATALOG
    .map((row) => scoreRow(row, facts))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)

  // 20 points requires at least two short positive signals (for example
  // “racket” + “paddle”) or one strong catalogue phrase. That is enough to
  // surface a LOW-confidence candidate and alternatives, but still rejects
  // generic terms such as “sports equipment” that score only once.
  if (!ranked.length || ranked[0].score < 20) {
    return {
      status: 'missing', top: null, alternatives: [], confidence: 'missing',
      missingFacts: missingFactsFor(facts, null),
      rationale: ['El producto quedó fuera de la cobertura suficiente del catálogo seed. No se inventa una NCM.'],
      catalog: NCM_CATALOG_META,
    }
  }

  const top = ranked[0]
  const second = ranked[1]
  const gap = second ? top.score - second.score : top.score
  const missingFacts = missingFactsFor(facts, top)
  let confidence: NcmClassification['confidence'] = 'low'
  if (top.score >= 80 && gap >= 35 && missingFacts.length === 0) confidence = 'high'
  else if (top.score >= 55 && gap >= 15) confidence = 'medium'

  return {
    status: 'candidate',
    top,
    alternatives: ranked.slice(1, 3),
    confidence,
    missingFacts,
    rationale: [
      `El candidato surge de un ranking limitado al catálogo NCM cargado; no se permite código fuera del catálogo.`,
      ...top.reasons.slice(0, 4),
      ...(second ? [`Diferencia frente al segundo candidato: ${gap} puntos.`] : []),
    ],
    catalog: NCM_CATALOG_META,
  }
}
