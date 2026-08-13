import { EXCLUDED_LISTING_TERMS, HIGH_BRAND_EQUITY } from './catalogRules'
import type { MlResult } from './marketTypes'

export function cleanText(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function hasKnownBrand(value: string) {
  const text = cleanText(value)
  return HIGH_BRAND_EQUITY.some((brand) => text.includes(brand))
}

export function buildMarketQuery(productName: string, category: string) {
  const text = cleanText(`${productName} ${category}`)
  if (text.includes('padel') && text.includes('carbon')) return 'paleta padel carbono'
  if (text.includes('padel')) return 'paleta padel'
  return cleanText(category || productName).split(' ').slice(0, 6).join(' ')
}

export function comparableScore(item: MlResult, productName: string, category: string) {
  const title = cleanText(item.title || '')
  const target = cleanText(`${productName} ${category}`)
  if (!title || !item.price || item.currency_id !== 'ARS') return 0
  if (item.condition && item.condition !== 'new') return 0
  if (EXCLUDED_LISTING_TERMS.some((term) => title.includes(term))) return 0
  if (!hasKnownBrand(productName) && hasKnownBrand(title)) return 0

  let score = 0
  if (target.includes('padel') && title.includes('padel')) score += 50
  if (target.includes('carbon')) score += title.includes('carbon') ? 25 : -20
  if (item.condition === 'new' || !item.condition) score += 10
  return Math.max(0, Math.min(100, score))
}
