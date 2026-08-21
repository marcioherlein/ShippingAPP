import { EXCLUDED_LISTING_TERMS, HIGH_BRAND_EQUITY } from './catalogRules'
import type { MlAttribute, MlResult } from './marketTypes'

export type MarketMatchContext = {
  categoryId?: string | null
  inferredAttributes?: MlAttribute[]
}

export function cleanText(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function hasKnownBrand(value: string) {
  const text = cleanText(value)
  return HIGH_BRAND_EQUITY.some((brand) => text.includes(brand))
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
    score += expectedValue === actualValue ? 4 : -6
  }
  return Math.max(-18, Math.min(12, score))
}

export function buildMarketQuery(productName: string, category: string) {
  const text = cleanText(`${productName} ${category}`)
  if (text.includes('padel')) {
    const base = text.includes('carbon') ? 'paleta padel carbono' : 'paleta padel'
    const specs = specTokens(text).slice(0, 2)
    return [base, ...specs].join(' ')
  }
  return cleanText(category || productName).split(' ').slice(0, 6).join(' ')
}

export function comparableScore(item: MlResult, productName: string, category: string, context: MarketMatchContext = {}) {
  const title = cleanText(item.title || '')
  const target = cleanText(`${productName} ${category}`)
  if (!title || !item.price || item.currency_id !== 'ARS') return 0
  if (item.condition && item.condition !== 'new') return 0
  if (EXCLUDED_LISTING_TERMS.some((term) => title.includes(term))) return 0
  if (!hasKnownBrand(productName) && hasKnownBrand(title)) return 0
  if (context.categoryId && item.category_id && item.category_id !== context.categoryId) return 0

  let score = 0
  if (target.includes('padel') && title.includes('padel')) score += 50
  if (target.includes('carbon')) score += title.includes('carbon') ? 25 : -20
  if (context.categoryId && item.category_id === context.categoryId) score += 10

  for (const token of specTokens(target)) {
    score += title.includes(token) ? 5 : -3
  }

  score += comparableAttributeScore(item, context.inferredAttributes)
  if (item.condition === 'new' || !item.condition) score += 10
  return Math.max(0, Math.min(100, score))
}
