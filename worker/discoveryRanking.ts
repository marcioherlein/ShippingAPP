import type { DiscoveryResult, DiscoveryResponse } from './productDiscovery'

export type DiscoveryConstraints = {
  maxUnitPriceUsd: number | null
  maxMoq: number | null
  originCountry: string | null
  excludedOriginCountries: string[]
  lowMoqPreference: boolean
  availableCapitalUsd: number | null
}

export type RankedDiscoveryResult = DiscoveryResult & {
  titleMatch: 'strong' | 'partial' | 'weak'
  matchedTerms: string[]
}

export type RankedDiscoveryResponse = Omit<DiscoveryResponse, 'results'> & {
  results: RankedDiscoveryResult[]
  constraints: DiscoveryConstraints
  constraintsNote: string
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'for', 'with', 'from', 'to', 'of', 'find', 'search', 'show', 'product', 'products', 'supplier', 'suppliers',
  'de', 'del', 'la', 'las', 'el', 'los', 'un', 'una', 'unos', 'unas', 'con', 'para', 'por', 'que', 'quiero', 'busca', 'buscame', 'buscar', 'producto', 'productos',
  'low', 'bajo', 'baja', 'moq', 'minimum', 'minimo', 'mínimo', 'order', 'pedido', 'usd', 'us', 'under', 'below', 'hasta', 'max', 'maximo', 'máximo',
  'capital', 'presupuesto', 'budget', 'tengo', 'dispongo', 'cuento',
])

const COUNTRY_ALIASES: Record<string, string> = {
  china: 'China', pakistan: 'Pakistan', india: 'India', vietnam: 'Vietnam', indonesia: 'Indonesia',
  brazil: 'Brazil', brasil: 'Brazil', turkey: 'Turkey', turquia: 'Turkey', 'turquía': 'Turkey',
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function canonicalToken(value: string) {
  let token = normalize(value).replace(/[^a-z0-9]+/g, '')
  if (token.length > 5 && token.endsWith('es')) token = token.slice(0, -2)
  else if (token.length > 4 && token.endsWith('s')) token = token.slice(0, -1)
  return token
}

function tokens(value: string) {
  const result: string[] = []
  for (const raw of normalize(value).split(/[^a-z0-9]+/)) {
    const token = canonicalToken(raw)
    if (token.length < 3 || STOPWORDS.has(raw) || STOPWORDS.has(token)) continue
    if (!result.includes(token)) result.push(token)
  }
  return result
}

function parseLocalizedNumber(raw: string, multiplierToken = '') {
  const cleaned = raw.replace(/\s+/g, '').replace(/[^\d.,]/g, '')
  if (!cleaned) return null
  const comma = cleaned.lastIndexOf(',')
  const dot = cleaned.lastIndexOf('.')
  let normalized = cleaned
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.'
    const thousands = decimal === ',' ? /\./g : /,/g
    normalized = cleaned.replace(thousands, '').replace(decimal, '.')
  } else if (comma >= 0) {
    const decimals = cleaned.length - comma - 1
    normalized = decimals === 1 || decimals === 2 ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '')
  } else if (dot >= 0) {
    const decimals = cleaned.length - dot - 1
    normalized = decimals === 3 ? cleaned.replace(/\./g, '') : cleaned
  }
  let value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0) return null
  if (/^(?:k|mil)$/i.test(multiplierToken.trim())) value *= 1000
  return value
}

function capturedNumber(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    const value = match?.[1] ? parseLocalizedNumber(match[1], match?.[2] || '') : null
    if (value !== null) return value
  }
  return null
}

function hasExcludedCountry(text: string, alias: string) {
  const a = normalize(alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [
    new RegExp(`\\b(?:no|sin|excepto|except|excluding|exclude)\\s+(?:de\\s+)?${a}\\b`, 'i'),
    new RegExp(`\\b(?:menos|salvo)\\s+${a}\\b`, 'i'),
    new RegExp(`\\bcualquier(?:\\s+origen)?\\s+menos\\s+${a}\\b`, 'i'),
  ].some((pattern) => pattern.test(text))
}

export function parseDiscoveryConstraints(userText: string): DiscoveryConstraints {
  const normalized = normalize(userText)
  const maxUnitPriceUsd = capturedNumber(normalized, [
    /(?:hasta|menos de|no mas de|max(?:imo)?|under|below)\s*(?:usd|us\$|\$)\s*([\d.,]+)(?:\s*(k|mil))?/i,
    /(?:usd|us\$|\$)\s*([\d.,]+)(?:\s*(k|mil))?\s*(?:o menos|max(?:imo)?)/i,
  ])
  const maxMoq = capturedNumber(normalized, [
    /(?:moq|pedido minimo|min(?:imum)? order)\s*(?:de|hasta|max(?:imo)?|<=|under|below)?\s*([\d.,]+)/i,
  ])
  const availableCapitalUsd = capturedNumber(normalized, [
    /(?:tengo|dispongo de|cuento con|capital(?: disponible)?|presupuesto|budget)\s*(?:de\s*)?(?:usd|us\$|\$)\s*([\d.,]+)(?:\s*(k|mil))?/i,
    /(?:usd|us\$|\$)\s*([\d.,]+)(?:\s*(k|mil))?\s*(?:de\s+)?(?:capital|presupuesto|budget)/i,
  ])
  const lowMoqPreference = /\b(?:moq bajo|moq baja|low moq|pedido minimo bajo)\b/i.test(normalized)

  let originCountry: string | null = null
  const excludedOriginCountries: string[] = []
  for (const [alias, canonical] of Object.entries(COUNTRY_ALIASES)) {
    const present = new RegExp(`\\b${normalize(alias)}\\b`, 'i').test(normalized)
    if (!present) continue
    if (hasExcludedCountry(normalized, alias)) {
      if (!excludedOriginCountries.includes(canonical)) excludedOriginCountries.push(canonical)
      continue
    }
    if (!originCountry) originCountry = canonical
  }

  return {
    maxUnitPriceUsd,
    maxMoq: maxMoq ? Math.round(maxMoq) : null,
    originCountry,
    excludedOriginCountries,
    lowMoqPreference,
    availableCapitalUsd,
  }
}

function rankOne(query: string, result: DiscoveryResult) {
  const queryTerms = tokens(query)
  const titleTerms = new Set(tokens(result.title))
  const matchedTerms = queryTerms.filter((term) => titleTerms.has(term))
  const ratio = queryTerms.length ? matchedTerms.length / queryTerms.length : 0
  const titleMatch: RankedDiscoveryResult['titleMatch'] = ratio >= 0.67 && matchedTerms.length >= 2
    ? 'strong' : matchedTerms.length > 0 ? 'partial' : 'weak'
  return { ...result, titleMatch, matchedTerms, score: ratio * 100 + matchedTerms.length }
}

export function rankDiscoveryResponse(source: DiscoveryResponse, userText: string): RankedDiscoveryResponse {
  const ranked = source.results
    .map((item, index) => ({ ...rankOne(source.query, item), index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ score: _score, index: _index, ...item }) => item)

  const constraints = parseDiscoveryConstraints(userText)
  const pending: string[] = []
  if (constraints.maxUnitPriceUsd !== null) pending.push(`precio ≤ USD ${constraints.maxUnitPriceUsd}`)
  if (constraints.maxMoq !== null) pending.push(`MOQ ≤ ${constraints.maxMoq}`)
  if (constraints.originCountry) pending.push(`origen ${constraints.originCountry}`)
  for (const country of constraints.excludedOriginCountries) pending.push(`origen ≠ ${country}`)
  if (constraints.lowMoqPreference) pending.push('preferencia por MOQ bajo')
  if (constraints.availableCapitalUsd !== null) pending.push(`capital disponible USD ${constraints.availableCapitalUsd} · affordability se evalúa con landed cost`)

  return {
    ...source,
    results: ranked,
    constraints,
    constraintsNote: pending.length
      ? `Criterios capturados; los de producto se validan en la publicación y el capital recién contra landed cost: ${pending.join(' · ')}.`
      : 'Sin restricciones comerciales duras detectadas; el orden usa sólo relevancia visible del título.',
  }
}
