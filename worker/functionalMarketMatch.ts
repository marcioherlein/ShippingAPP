import { EXCLUDED_LISTING_TERMS, HIGH_BRAND_EQUITY } from './catalogRules'
import { cleanText } from './catalogMatch'
import type { MlResult } from './marketTypes'

export type ArgentinaMarketMatchMode = 'exact' | 'functional'

const SPEC_UNITS = 'tb|gb|mb|mah|w|watt|watts|kw|v|volt|volts|hz|kg|g|l|lt|litro|litros|ml|cm|mm|pa|inch|inches|pulgada|pulgadas'
const SPEC_UNIT_ALIASES: Record<string, string> = {
  tb: 'tb', gb: 'gb', mb: 'mb', mah: 'mah', w: 'w', watt: 'w', watts: 'w', kw: 'kw', v: 'v', volt: 'v', volts: 'v',
  hz: 'hz', kg: 'kg', g: 'g', l: 'l', lt: 'l', litro: 'l', litros: 'l', ml: 'ml', cm: 'cm', mm: 'mm', pa: 'pa',
  inch: 'inch', inches: 'inch', pulgada: 'inch', pulgadas: 'inch',
}

const TOKEN_ALIASES: Record<string, string> = {
  aspiradora: 'vacuum', vacuum: 'vacuum',
  paleta: 'racket', raqueta: 'racket', racket: 'racket',
  celular: 'phone', smartphone: 'phone', telefono: 'phone', movil: 'phone', phone: 'phone',
  taladro: 'drill', drill: 'drill',
  auricular: 'headphones', auriculares: 'headphones', headphones: 'headphones',
  parlante: 'speaker', speaker: 'speaker',
  licuadora: 'blender', blender: 'blender',
  inalambrico: 'wireless', inalambrica: 'wireless', wireless: 'wireless', cordless: 'wireless',
  electrico: 'electric', electrica: 'electric', electric: 'electric',
  carbono: 'carbon', carbon: 'carbon',
  caja: 'box', box: 'box',
  organizadora: 'storage', organizador: 'storage', storage: 'storage',
}

const STOPWORDS = new Set(['a', 'al', 'and', 'con', 'de', 'del', 'el', 'en', 'for', 'la', 'las', 'los', 'of', 'para', 'por', 'the', 'un', 'una', 'with', 'generic', 'generico', 'generica', 'nuevo', 'nueva', 'original', 'premium'])
const ACCESSORY_TERMS = new Set([...EXCLUDED_LISTING_TERMS, 'case', 'cover', 'replacement', 'repuesto', 'spare', 'accesorio', 'carcasa', 'filtro', 'cable', 'cargador', 'soporte'])
const BUNDLE_TERMS = new Set(['combo', 'bundle', 'kit'])
const DISPLAY_SHORTHANDS = new Set(['3k', '4k', '6k', '8k', '12k', '18k', '24k'])

function normalizedTokens(value: string) {
  return cleanText(value)
    .split(' ')
    .map((token) => TOKEN_ALIASES[token] || token)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
}

function tokenSet(value: string) {
  return new Set(normalizedTokens(value))
}

function containsBrand(value: string) {
  const haystack = ` ${cleanText(value)} `
  return HIGH_BRAND_EQUITY.some((brand) => haystack.includes(` ${cleanText(brand)} `))
}

function strippedIdentityText(value: string) {
  return cleanText(value)
    .replace(new RegExp(`\\d+(?:[.,]\\d+)?\\s*(${SPEC_UNITS})\\b`, 'g'), ' ')
    .replace(/\b(?:pack\s*(?:x\s*)?|x\s*)\d{1,3}\b/g, ' ')
    .replace(/\b\d{1,3}\s*(?:unidades|unidad|units|pcs|piezas)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasStrongIdentity(productName: string) {
  if (containsBrand(productName)) return true
  const stripped = strippedIdentityText(productName)
  const tokens = stripped.split(' ').filter(Boolean)
  if (tokens.some((token) => /[a-z]/.test(token) && /\d/.test(token) && !DISPLAY_SHORTHANDS.has(token))) return true
  if (/\b\d+[.,]\d+\b/.test(stripped)) return true
  if ((stripped.match(/\b\d{2,4}\b/g) || []).some((value) => Number(value) >= 10)) return true
  return false
}

export function inferArgentinaMarketMatchMode(productName: string, _category = ''): ArgentinaMarketMatchMode {
  return hasStrongIdentity(productName) ? 'exact' : 'functional'
}

function itemEvidence(item: MlResult) {
  return [item.title || '', ...(item.attributes || []).map((attribute) => attribute.value_name || '')].join(' ')
}

function extractSpecs(value: string) {
  const specs = new Map<string, Set<string>>()
  const re = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${SPEC_UNITS})\\b`, 'g')
  for (const match of cleanText(value).matchAll(re)) {
    const unit = SPEC_UNIT_ALIASES[match[2]] || match[2]
    const amount = Number(match[1].replace(',', '.'))
    if (!Number.isFinite(amount)) continue
    const values = specs.get(unit) || new Set<string>()
    values.add(String(amount))
    specs.set(unit, values)
  }
  return specs
}

function hasSpecConflict(target: string, candidate: string) {
  const expected = extractSpecs(target)
  const actual = extractSpecs(candidate)
  for (const [unit, expectedValues] of expected) {
    const actualValues = actual.get(unit)
    if (!actualValues?.size) continue
    if (![...expectedValues].every((value) => actualValues.has(value))) return true
  }
  return false
}

function matchedSpecCount(target: string, candidate: string) {
  const expected = extractSpecs(target)
  const actual = extractSpecs(candidate)
  let count = 0
  for (const [unit, expectedValues] of expected) {
    const actualValues = actual.get(unit)
    if (actualValues && [...expectedValues].every((value) => actualValues.has(value))) count += 1
  }
  return count
}

function extractPackQuantity(value: string) {
  const text = cleanText(value)
  const patterns = [/\bpack\s*(?:x\s*)?(\d{1,3})\b/, /\bx\s*(\d{1,3})\b/, /\b(\d{1,3})\s*(?:unidades|unidad|units|pcs|piezas)\b/]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    const amount = match ? Number(match[1]) : 0
    if (Number.isInteger(amount) && amount > 0) return amount
  }
  return null
}

function hasAccessoryMismatch(target: string, candidate: string) {
  const targetTokens = tokenSet(target)
  const candidateTokens = tokenSet(candidate)
  return [...ACCESSORY_TERMS].some((term) => {
    const normalized = TOKEN_ALIASES[cleanText(term)] || cleanText(term)
    return candidateTokens.has(normalized) && !targetTokens.has(normalized)
  })
}

function hasBundleMismatch(target: string, candidate: string) {
  const targetTokens = tokenSet(target)
  const candidateTokens = tokenSet(candidate)
  return [...BUNDLE_TERMS].some((term) => candidateTokens.has(term) && !targetTokens.has(term))
}

function hasCriticalTraitConflict(target: string, candidate: string) {
  const expected = tokenSet(target)
  const actual = tokenSet(candidate)
  const targetCarbon = expected.has('carbon')
  const candidateGlass = actual.has('fiberglass') || actual.has('vidrio') || (actual.has('fibra') && actual.has('vidrio'))
  if (targetCarbon && candidateGlass && !actual.has('carbon')) return true

  const targetElectric = expected.has('electric')
  const candidateElectric = actual.has('electric')
  const targetGas = expected.has('gas')
  const candidateGas = actual.has('gas')
  if ((targetElectric && candidateGas && !candidateElectric) || (targetGas && candidateElectric && !candidateGas)) return true

  const targetWireless = expected.has('wireless')
  const candidateWireless = actual.has('wireless')
  if (targetWireless && (actual.has('cableado') || actual.has('wired')) && !candidateWireless) return true
  return false
}

function overlapScore(target: string, candidate: string) {
  const expected = tokenSet(target)
  const actual = tokenSet(candidate)
  if (!expected.size || !actual.size) return 0
  const common = [...expected].filter((token) => actual.has(token)).length
  return common / Math.max(1, Math.min(expected.size, actual.size))
}

function categoryEvidenceScore(category: string, candidate: string) {
  const categoryTokens = tokenSet(category)
  const actual = tokenSet(candidate)
  if (!categoryTokens.size) return 0
  const common = [...categoryTokens].filter((token) => actual.has(token)).length
  if (common === 0) return 0
  return Math.min(38, 22 + (common / categoryTokens.size) * 16)
}

function traitBonus(target: string, candidate: string) {
  const expected = tokenSet(target)
  const actual = tokenSet(candidate)
  let score = 0
  for (const trait of ['carbon', 'wireless', 'electric', 'eva', 'diamante', 'redonda', 'lagrima']) {
    if (expected.has(trait) && actual.has(trait)) score += 7
  }
  return Math.min(18, score)
}

export function buildFunctionalMarketQuery(productName: string, category: string) {
  const specs = [...extractSpecs(productName).entries()].flatMap(([unit, values]) => [...values].map((value) => `${value}${unit}`))
  const productTokens = normalizedTokens(productName).filter((token) => !containsBrand(token)).filter((token) => token.length >= 3)
  const categoryTokens = normalizedTokens(category)
  const usefulTraits = productTokens.filter((token) => ['carbon', 'wireless', 'electric', 'eva', 'diamante', 'redonda', 'lagrima', 'storage', 'box'].includes(token))
  const query = [...categoryTokens, ...usefulTraits, ...specs]
  return [...new Set(query)].slice(0, 8).join(' ') || cleanText(category || productName)
}

export function functionalComparableScore(item: MlResult, productName: string, category: string) {
  const title = item.title || ''
  const evidence = itemEvidence(item)
  const target = `${productName} ${category}`
  if (!cleanText(title) || !item.price || item.price <= 0 || item.currency_id !== 'ARS') return 0
  if (item.condition && item.condition !== 'new') return 0
  if (hasAccessoryMismatch(target, title)) return 0
  if (hasBundleMismatch(target, title)) return 0
  if (hasSpecConflict(target, evidence)) return 0
  if (hasCriticalTraitConflict(target, evidence)) return 0

  const targetPack = extractPackQuantity(target)
  const candidatePack = extractPackQuantity(title)
  if (targetPack && candidatePack && targetPack !== candidatePack) return 0
  if (!targetPack && candidatePack && candidatePack > 1) return 0

  const categoryScore = categoryEvidenceScore(category, evidence)
  if (categoryScore === 0) return 0

  let score = categoryScore
  score += overlapScore(productName, evidence) * 22
  score += Math.min(32, matchedSpecCount(target, evidence) * 16)
  score += traitBonus(target, evidence)
  score += 10

  if (containsBrand(title) && !containsBrand(productName)) score -= 5
  return Math.max(0, Math.min(100, Math.round(score)))
}
