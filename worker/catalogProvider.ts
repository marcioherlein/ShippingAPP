import { buildMarketQuery, cleanText, comparableScore } from './catalogMatch'
import { percentile, trimPriceOutliers } from './catalogStats'
import type { ArgentinaMarketResult, MarketComparable, MlSearch } from './marketTypes'

export async function analyzeArgentinaMarket(productName: string, category: string): Promise<ArgentinaMarketResult> {
  const query = buildMarketQuery(productName, category)
  const warnings = [
    'Search prices are screening prices, not authenticated checkout prices.',
    'Demand is not inferred from public available quantity.',
  ]
  try {
    const url = `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(query)}&limit=50`
    const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'ShippingAPP/0.4' } })
    if (!response.ok) throw new Error(`market source ${response.status}`)
    const data = await response.json() as MlSearch
    const raw = Array.isArray(data.results) ? data.results : []
    const seen = new Set<string>()
    const matches: MarketComparable[] = []

    for (const item of raw) {
      const score = comparableScore(item, productName, category)
      if (score < 55 || !item.price) continue
      const key = item.catalog_product_id || `${cleanText(item.title || '')}:${item.seller?.id || 'x'}`
      if (seen.has(key)) continue
      seen.add(key)
      matches.push({ id: item.id || '', title: item.title || '', priceArs: item.price, score, reason: score >= 65 ? 'strong comparable' : 'fallback comparable', permalink: item.permalink })
    }

    const strict = matches.filter((item) => item.score >= 65)
    const acceptedBeforeTrim = strict.length >= 5 ? strict : matches
    const accepted = trimPriceOutliers(acceptedBeforeTrim, (item) => item.priceArs, 5)
    const prices = accepted.map((item) => item.priceArs)
    const p25Ars = percentile(prices, 0.25)
    const medianArs = percentile(prices, 0.5)
    const p75Ars = percentile(prices, 0.75)
    const suggestedPriceArs = percentile(prices, 0.4)
    const confidence = Math.min(90, Math.round((accepted.length / 12) * 60 + (strict.length / Math.max(1, acceptedBeforeTrim.length)) * 20 + (medianArs ? 10 : 0)))
    if (accepted.length < acceptedBeforeTrim.length) warnings.push(`${acceptedBeforeTrim.length - accepted.length} price outlier(s) excluded by IQR screening.`)

    return { status: accepted.length >= 5 && medianArs ? 'live' : 'insufficient', query, rawCount: raw.length, comparableCount: accepted.length, p25Ars, medianArs, p75Ars, suggestedPriceArs, confidence, source: 'Mercado Libre Argentina public search', priceQuality: 'listed_search_price', comparables: accepted.sort((a, b) => b.score - a.score).slice(0, 8), warnings }
  } catch (error) {
    return { status: 'unavailable', query, rawCount: 0, comparableCount: 0, p25Ars: null, medianArs: null, p75Ars: null, suggestedPriceArs: null, confidence: 0, source: 'Mercado Libre Argentina public search', priceQuality: 'listed_search_price', comparables: [], warnings: [...warnings, error instanceof Error ? error.message : 'market unavailable'] }
  }
}
