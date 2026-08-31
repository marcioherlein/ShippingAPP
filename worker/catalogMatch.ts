import { EXCLUDED_LISTING_TERMS, HIGH_BRAND_EQUITY } from './catalogRules'
import type { MlAttribute, MlResult } from './marketTypes'

export type MarketMatchContext = {
  categoryId?: string | null
  inferredAttributes?: MlAttribute[]
}

const STOPWORDS = new Set([
  'a', 'al', 'and', 'con', 'de', 'del', 'el', 'en', 'for', 'la', 'las', 'los', 'of', 'para', 'por', 'the', 'un', 'una', 'with',
  'nuevo', 'nueva', 'original', 'oficial', 'profesional', 'premium', 'alta', 'calidad', 'envio', 'gratis',
])

const TOKEN_ALIASES: Record<string, string> = {
  carbono: 'carbon',
  carbon: 'carbon',
  celular: 'smartphone',
  smartphone: 'smartphone',
  telefono: 'smartphone',
  móvil: 'smartphone',
  movil: 'smartphone',
  paleta: 'racket',
  raqueta: 'racket',
  racket: 'racket',
  taladro: 'drill',
  drill: 'drill',
  aspiradora: 'vacuum',
  vacuum: 'vacuum',
  auricular: 'headphones',
  auriculares: 'headphones',
  headphones: 'headphones',
}

const SEARCH_TRANSLATIONS: Record<string, string> = {
  smartphone: 'celular',
  phone: 'celular',
  drill: 'taladro',
  vacuum: 'aspiradora',
  blender: 'licuadora',
  headphones: 'auriculares',
  speaker: 'parlante',
  racket: 'paleta',
  'padel racket': 'paleta padel',
}

const ACCESSORY_TERMS = new Set([
  ...EXCLUDED_LISTING_TERMS,
  'case', 'cover', 'replacement', 'repuesto', 'spare', 'accesorio', 'carcasa', 'filtro', 'cable', 'cargador', 'soporte',
])

const VARIANT_MODIFIERS = new Set(['pro', 'max', 'plus', 'ultra', 'mini', 'lite', 'air', 'se'])
const SPEC_UNIT_ALIASES: Record<string, string> = {
  tb: 'tb', gb: 'gb', mb: 'mb', mah: 'mah', w: 'w', watt: 'w', watts: 'w', kw: 'kw', v: 'v', volt: 'v', volts: 'v',
  hz: 'hz', kg: 'kg', g: 'g', l: 'l', lt: 'l', litro: 'l', litros: 'l', ml: 'ml', cm: 'cm', mm: 'mm', pa: 'pa',
  inch: 'inch', inches: 'inch', pulgada: 'inch', pulgadas: 'inch',
}

export function cleanText(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeToken(token: string) {
  return TOKEN_ALIASES[token] || token
}

function tokens(value: string) {
  return cleanText(value)
    .split(' ')
    .map(normalizeToken)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
}

function tokenSet(value: string) {
  return new Set(tokens(value))
}

function hasKnownBrand(value: string) {
  const text = cleanText(value)
  return HIGH_BRAND_EQUITY.some((brand) => text.includes(cleanText(brand)))
}

function specTokens(value: string) {
  const text = cleanText(value)
  const patterns = ['3k', '6k', '12k', '18k', '24k', 'eva', 'diamante', 'redonda', 'lagrima']
  return patterns.filter((token) => text.includes(token))
}

function comparableAttributeScore(item: MlResult, inferred: MlAttribute[] | undefined) {
  if (!inferred?.length || !item.attributes?.length) return 0
  let score = 0
  for (const expected of inferred) {
    if (!expected.id || !expected.value_name) continue
    const actual = item.attributes.find((attribute) => attribute.id === expected.id)
    if (!actual?.value_name) continue
    const expectedValue = cleanText(expected.value_name)
    const actualValue = cleanText(actual.value_name)
    if (!expectedValue || !actualValue) continue
    score += expectedValue === actualValue ? 5 : -8
  }
  return Math.max(-24, Math.min(18, score))
}

function extractSpecs(value: string) {
  const text = cleanText(value)
  const specs = new Map<string, Set<string>>()
  const re = /(\d+(?:[.,]\d+)?)\s*(tb|gb|mb|mah|w|watt|watts|kw|v|volt|volts|hz|kg|g|l|lt|litro|litros|ml|cm|mm|pa|inch|inches|pulgada|pulgadas)\b/g
  for (const match of text.matchAll(re)) {
    const unit = SPEC_UNIT_ALIASES[match[2]] || match[2]
    const valueNumber = Number(match[1].replace(',', '.'))
    if (!Number.isFinite(valueNumber)) continue
    const valueKey = `${valueNumber}`
    const current = specs.get(unit) || new Set<string>()
    current.add(valueKey)
    specs.set(unit, current)
  }
  return specs
}

function hasConflictingSpecs(target: string, candidate: string) {
  const expected = extractSpecs(target)
  const actual = extractSpecs(candidate)
  for (const [unit, expectedValues] of expected) {
    const actualValues = actual.get(unit)
    if (!actualValues?.size) continue
    const intersects = [...expectedValues].some((value) => actualValues.has(value))
    if (!intersects) return true
  }
  return false
}

function matchedSpecCount(target: string, candidate: string) {
  const expected = extractSpecs(target)
  const actual = extractSpecs(candidate)
  let matches = 0
  for (const [unit, expectedValues] of expected) {
    const actualValues = actual.get(unit)
    if (actualValues && [...expectedValues].some((value) => actualValues.has(value))) matches += 1
  }
  return matches
}

function modelCodes(value: string) {
  return new Set(tokens(value).filter((token) => {
    if (!/[a-z]/.test(token) || !/\d/.test(token)) return false
    if (/^\d+x\d+/.test(token)) return false
    if (/^\d+(tb|gb|mb|mah|w|kw|v|hz|kg|g|l|ml|cm|mm|pa)$/.test(token)) return false
    return token.length >= 3
  }))
}

function standaloneVersionNumbers(value: string) {
  const text = cleanText(value)
  const stripped = text
    .replace(/\d+(?:[.,]\d+)?\s*(tb|gb|mb|mah|w|watt|watts|kw|v|volt|volts|hz|kg|g|l|lt|litro|litros|ml|cm|mm|pa|inch|inches|pulgada|pulgadas)\b/g, ' ')
    .replace(/\b\d+x\d+(?:x\d+)?\b/g, ' ')
  return new Set((stripped.match(/\b\d{2,4}\b/g) || []).filter((value) => Number(value) >= 10))
}

function variantModifiers(value: string) {
  const set = tokenSet(value)
  return new Set([...set].filter((token) => VARIANT_MODIFIERS.has(token)))
}

function setsEqual<T>(a: Set<T>, b: Set<T>) {
  return a.size === b.size && [...a].every((value) => b.has(value))
}

function extractPackQuantity(value: string) {
  const text = cleanText(value)
  const patterns = [
    /\bpack\s*(?:x\s*)?(\d{1,3})\b/,
    /\bx\s*(\d{1,3})\b/,
    /\b(\d{1,3})\s*(?:unidades|unidad|units|pcs|piezas)\b/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    const quantity = Number(match[1])
    if (Number.isInteger(quantity) && quantity > 0) return quantity
  }
  return null
}

function hasAccessoryMismatch(target: string, candidate: string) {
  const targetTokens = tokenSet(target)
  const candidateTokens = tokenSet(candidate)
  for (const term of ACCESSORY_TERMS) {
    const normalized = normalizeToken(cleanText(term))
    if (candidateTokens.has(normalized) && !targetTokens.has(normalized)) return true
  }
  return false
}

function lexicalOverlap(target: string, candidate: string) {
  const expected = tokenSet(target)
  const actual = tokenSet(candidate)
  if (!expected.size || !actual.size) return 0
  const common = [...expected].filter((token) => actual.has(token)).length
  const denominator = Math.max(3, Math.min(expected.size, actual.size))
  return Math.min(1, common / denominator)
}

function hasConflictingModelCode(target: string, candidate: string) {
  const expected = modelCodes(target)
  const actual = modelCodes(candidate)
  if (!expected.size || !actual.size) return false
  return ![...expected].some((code) => actual.has(code))
}

function hasConflictingVersionNumber(target: string, candidate: string) {
  const expected = standaloneVersionNumbers(target)
  const actual = standaloneVersionNumbers(candidate)
  if (!expected.size || !actual.size) return false
  return ![...expected].some((version) => actual.has(version))
}

function modelEvidenceScore(target: string, candidate: string) {
  const expectedCodes = modelCodes(target)
  const actualCodes = modelCodes(candidate)
  if (expectedCodes.size && actualCodes.size && [...expectedCodes].some((code) => actualCodes.has(code))) return 18

  const expectedVersions = standaloneVersionNumbers(target)
  const actualVersions = standaloneVersionNumbers(candidate)
  if (expectedVersions.size && actualVersions.size && [...expectedVersions].some((version) => actualVersions.has(version))) return 10
  return 0
}

export function buildMarketQuery(productName: string, category: string) {
  const normalized = cleanText(`${productName} ${category}`)
  if (normalized.includes('padel')) {
    const base = normalized.includes('carbon') || normalized.includes('carbono') ? 'paleta padel carbono' : 'paleta padel'
    const specs = specTokens(normalized).slice(0, 2)
    return [base, ...specs].join(' ')
  }

  const translatedCategory = SEARCH_TRANSLATIONS[cleanText(category)] || cleanText(category)
  const source = [...tokens(productName), ...tokens(translatedCategory)]
  const unique: string[] = []
  for (const token of source) {
    if (!unique.includes(token)) unique.push(token)
    if (unique.length >= 8) break
  }
  return unique.join(' ')
}

export function comparableScore(item: MlResult, productName: string, category: string, context: MarketMatchContext = {}) {
  const title = item.title || ''
  const cleanedTitle = cleanText(title)
  const target = cleanText(`${productName} ${category}`)
  if (!cleanedTitle || !item.price || item.currency_id !== 'ARS') return 0
  if (item.condition && item.condition !== 'new') return 0
  if (context.categoryId && item.category_id && item.category_id !== context.categoryId) return 0
  if (hasAccessoryMismatch(target, cleanedTitle)) return 0
  if (!hasKnownBrand(productName) && hasKnownBrand(cleanedTitle)) return 0
  if (hasConflictingSpecs(target, cleanedTitle)) return 0
  if (hasConflictingModelCode(target, cleanedTitle)) return 0
  if (hasConflictingVersionNumber(target, cleanedTitle)) return 0

  const targetPack = extractPackQuantity(target)
  const candidatePack = extractPackQuantity(cleanedTitle)
  if (targetPack && candidatePack && targetPack !== candidatePack) return 0
  if (!targetPack && candidatePack && candidatePack > 1) return 0

  const targetModifiers = variantModifiers(target)
  const candidateModifiers = variantModifiers(cleanedTitle)
  if (!setsEqual(targetModifiers, candidateModifiers) && (targetModifiers.size || candidateModifiers.size)) return 0

  let score = 0
  score += lexicalOverlap(target, cleanedTitle) * 52
  score += modelEvidenceScore(target, cleanedTitle)
  score += Math.min(16, matchedSpecCount(target, cleanedTitle) * 8)
  score += comparableAttributeScore(item, context.inferredAttributes)
  if (context.categoryId && item.category_id === context.categoryId) score += 12
  if (item.condition === 'new' || !item.condition) score += 10

  // Domain extension retained as regression support, but no longer forms the base matcher.
  if (target.includes('padel') && cleanedTitle.includes('padel')) score += 22
  if (target.includes('carbon') && cleanedTitle.includes('carbon')) score += 12
  for (const token of specTokens(target)) score += cleanedTitle.includes(token) ? 3 : -2

  return Math.max(0, Math.min(100, Math.round(score)))
}
