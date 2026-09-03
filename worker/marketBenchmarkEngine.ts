import { buildMarketQuery, cleanText, comparableScore } from './catalogMatch'
import {
  functionalComparableScore,
  inferArgentinaMarketMatchMode,
  type ArgentinaMarketMatchMode,
} from './functionalMarketMatch'
import { buildArgentinaFunctionalMarketQuery } from './functionalMarketQuery'
import { percentile, trimPriceOutliers } from './catalogStats'
import type { ArgentinaMarketResult, MarketComparable, MlResult } from './marketTypes'
import type {
  ArgentinaMarketCandidate,
  ArgentinaMarketDiscoveryProvider,
  ArgentinaMarketPriceResolver,
} from './marketProviderContracts'

export type ArgentinaMarketBenchmarkOptions = {
  priceResolver?: ArgentinaMarketPriceResolver | null
  priceLookupLimit?: number
  minimumComparables?: number
}

const EXACT_DISCOVERY_GENERIC_TOKENS = new Set([
  'a', 'al', 'and', 'con', 'de', 'del', 'el', 'en', 'for', 'la', 'las', 'los', 'of', 'para', 'por', 'the', 'un', 'una', 'with',
  'mouse', 'wireless', 'inalambrico', 'inalambrica', 'computer', 'computadora',
  'robot', 'vacuum', 'aspiradora', 'smartphone', 'celular', 'phone', 'telefono',
  'headphones', 'auriculares', 'speaker', 'parlante', 'drill', 'taladro', 'blender', 'licuadora',
])

const EXACT_DISCOVERY_SPEC_TOKEN = /^\d+(?:[.,]\d+)?(?:tb|gb|mb|mah|w|kw|v|hz|kg|g|l|ml|cm|mm|pa|bar|mp|inch)$/

function buildExactDiscoveryQuery(productName: string, category: string) {
  const fallback = buildMarketQuery(productName, category)
  const productTokens = cleanText(productName).split(' ').filter(Boolean)
  const modelIndex = productTokens.findIndex((token) => (
    token.length >= 2
    && /[a-z]/.test(token)
    && /\d/.test(token)
    && !EXACT_DISCOVERY_SPEC_TOKEN.test(token)
  ))
  if (modelIndex < 0) return fallback

  const identityPrefix = productTokens
    .slice(0, modelIndex)
    .filter((token) => token.length >= 2 && !EXACT_DISCOVERY_GENERIC_TOKENS.has(token))
    .slice(-2)
  const compact = [...new Set([...identityPrefix, productTokens[modelIndex]])]
  return compact.length >= 2 ? compact.join(' ') : fallback
}

function emptyResult(
  status: ArgentinaMarketResult['status'],
  query: string,
  matchMode: ArgentinaMarketMatchMode,
  source: string,
  warnings: string[],
): ArgentinaMarketResult {
  return {
    status,
    query,
    matchMode,
    categoryId: null,
    categoryName: null,
    rawCount: 0,
    comparableCount: 0,
    effectivePriceCount: 0,
    p25Ars: null,
    medianArs: null,
    p75Ars: null,
    suggestedPriceArs: null,
    confidence: 0,
    source,
    priceQuality: 'listed_search_price',
    comparables: [],
    warnings,
  }
}

function asMatcherItem(candidate: ArgentinaMarketCandidate): MlResult {
  return {
    id: candidate.id,
    title: candidate.title,
    price: candidate.priceArs,
    currency_id: 'ARS',
    condition: candidate.condition,
    category_id: candidate.categoryId,
    catalog_product_id: candidate.catalogProductId,
    seller: candidate.sellerKey && /^\d+$/.test(candidate.sellerKey)
      ? { id: Number(candidate.sellerKey) }
      : undefined,
    permalink: candidate.permalink,
    attributes: candidate.attributes,
  }
}

function toComparable(candidate: ArgentinaMarketCandidate, score: number, matchMode: ArgentinaMarketMatchMode): MarketComparable {
  return {
    id: candidate.id,
    title: candidate.title,
    priceArs: candidate.priceArs,
    listedPriceArs: candidate.priceArs,
    priceSource: 'search_price',
    score,
    reason: matchMode === 'functional'
      ? (score >= 65 ? 'strong functional comparable' : 'functional comparable')
      : (score >= 65 ? 'strong comparable' : 'fallback comparable'),
    permalink: candidate.permalink,
    categoryId: candidate.categoryId,
    catalogProductId: candidate.catalogProductId,
  }
}

function dedupeKey(candidate: ArgentinaMarketCandidate) {
  if (candidate.catalogProductId) return `catalog:${candidate.catalogProductId}`
  if (candidate.id) return `id:${candidate.id}`
  return `title:${cleanText(candidate.title)}:${candidate.sellerKey || 'x'}`
}

function directRetailerName(candidate: ArgentinaMarketCandidate) {
  const sellerKey = candidate.sellerKey?.trim()
  if (sellerKey?.includes(':')) return sellerKey.slice(0, sellerKey.indexOf(':')).trim()
  return ''
}

function acceptedSourceLabel(
  discoveryProviderId: string,
  discoverySourceLabel: string,
  selected: Array<{ candidate: ArgentinaMarketCandidate; comparable: MarketComparable }>,
  accepted: MarketComparable[],
) {
  if (discoveryProviderId !== 'argentina-direct-retailers' || !accepted.length) return discoverySourceLabel
  const acceptedIds = new Set(accepted.map((item) => item.id))
  const names: string[] = []
  const seen = new Set<string>()
  for (const { candidate, comparable } of selected) {
    if (!acceptedIds.has(comparable.id)) continue
    const name = directRetailerName(candidate)
    if (!name || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names.length ? `Retailers argentinos directos · ${names.join(' + ')}` : discoverySourceLabel
}

async function resolveComparablePrice(
  comparable: MarketComparable,
  candidate: ArgentinaMarketCandidate,
  resolver: ArgentinaMarketPriceResolver,
): Promise<MarketComparable> {
  try {
    const resolved = await resolver.resolve(candidate)
    if (!resolved || !Number.isFinite(resolved.priceArs) || resolved.priceArs <= 0) return comparable
    return {
      ...comparable,
      priceArs: resolved.priceArs,
      priceSource: resolved.effective ? 'sale_price' : 'search_price',
    }
  } catch {
    return comparable
  }
}

export async function runArgentinaMarketBenchmark(
  productName: string,
  category: string,
  discoveryProvider: ArgentinaMarketDiscoveryProvider,
  options: ArgentinaMarketBenchmarkOptions = {},
): Promise<ArgentinaMarketResult> {
  const matchMode = inferArgentinaMarketMatchMode(productName, category)
  const defaultExactQuery = buildMarketQuery(productName, category)
  const query = matchMode === 'functional'
    ? buildArgentinaFunctionalMarketQuery(productName, category)
    : buildExactDiscoveryQuery(productName, category)
  const minimumComparables = Math.max(1, Math.min(20, options.minimumComparables ?? 5))
  const warnings = [
    'Demand is not inferred from public available quantity.',
    'Provider discovery price is retained only as a traceable fallback when an effective-price resolver is unavailable.',
    matchMode === 'functional'
      ? 'Market benchmark uses functional-equivalent matching because the target lacks strong branded/model identity. Price should be interpreted as a comparable-market range, not the same-SKU local price.'
      : 'Market benchmark uses exact-identity matching for branded/model-specific product evidence.',
  ]
  if (matchMode === 'exact' && query !== defaultExactQuery) {
    warnings.push(`Exact discovery query was compacted around strong model identity (${query}); deterministic exact matching still gates every accepted comparable.`)
  }

  let discovery
  try {
    discovery = await discoveryProvider.discover({ query, productName, category })
  } catch (error) {
    return emptyResult(
      'unavailable',
      query,
      matchMode,
      discoveryProvider.id,
      [...warnings, error instanceof Error ? error.message : 'Argentina market discovery provider failed'],
    )
  }

  warnings.push(...(discovery.warnings || []))
  const raw = Array.isArray(discovery.candidates) ? discovery.candidates : []
  const seen = new Set<string>()
  const matched: Array<{ candidate: ArgentinaMarketCandidate; comparable: MarketComparable }> = []
  const categoryHint = discovery.categoryHint

  for (const candidate of raw) {
    if (!candidate || !candidate.title || !Number.isFinite(candidate.priceArs) || candidate.priceArs <= 0) continue
    const key = dedupeKey(candidate)
    if (seen.has(key)) continue
    seen.add(key)

    const matcherItem = asMatcherItem(candidate)
    const score = matchMode === 'functional'
      ? functionalComparableScore(matcherItem, productName, category)
      : comparableScore(matcherItem, productName, category, {
          categoryId: categoryHint?.categoryId,
          inferredAttributes: categoryHint?.attributes,
        })
    if (score < 55) continue
    matched.push({ candidate, comparable: toComparable(candidate, score, matchMode) })
  }

  const strict = matched.filter(({ comparable }) => comparable.score >= 65)
  const selected = strict.length >= minimumComparables ? strict : matched
  const resolver = options.priceResolver || null
  const lookupLimit = resolver
    ? Math.max(0, Math.min(50, options.priceLookupLimit ?? 24))
    : 0

  const pricedHead = resolver
    ? await Promise.all(selected.slice(0, lookupLimit).map(({ comparable, candidate }) => resolveComparablePrice(comparable, candidate, resolver)))
    : []
  const priced = [
    ...pricedHead,
    ...selected.slice(lookupLimit).map(({ comparable }) => comparable),
  ]
  const accepted = trimPriceOutliers(priced, (item) => item.priceArs, minimumComparables)
  const prices = accepted.map((item) => item.priceArs)
  const p25Ars = percentile(prices, 0.25)
  const medianArs = percentile(prices, 0.5)
  const p75Ars = percentile(prices, 0.75)
  const suggestedPriceArs = percentile(prices, 0.4)
  const effectivePriceCount = accepted.filter((item) => item.priceSource === 'sale_price').length
  const effectiveCoverage = accepted.length ? effectivePriceCount / accepted.length : 0
  const strictShare = selected.length ? strict.length / selected.length : 0
  const baseConfidence = Math.min(95, Math.round(
    Math.min(50, (accepted.length / 12) * 50)
    + strictShare * 20
    + (categoryHint?.categoryId ? 10 : 0)
    + effectiveCoverage * 15,
  ))
  const confidence = matchMode === 'functional'
    ? Math.min(80, Math.max(0, baseConfidence - 10))
    : baseConfidence

  if (priced.length > accepted.length) warnings.push(`${priced.length - accepted.length} price outlier(s) excluded by IQR screening.`)
  const fallbackPriceCount = accepted.length - effectivePriceCount
  if (fallbackPriceCount > 0) warnings.push(`${fallbackPriceCount} comparable(s) use provider listing price because effective price was unavailable.`)
  if (accepted.length < minimumComparables) warnings.push(`Only ${accepted.length} accepted comparable(s); minimum live-benchmark floor is ${minimumComparables}.`)

  const priceQuality: ArgentinaMarketResult['priceQuality'] = effectivePriceCount === accepted.length && accepted.length > 0
    ? 'effective_sale_price'
    : effectivePriceCount > 0
      ? 'mixed_sale_and_search_price'
      : 'listed_search_price'

  const resolverSuffix = resolver && effectivePriceCount > 0 ? ` + ${resolver.id}` : ''
  const evidenceSource = acceptedSourceLabel(discovery.providerId, discovery.sourceLabel, selected, accepted)
  return {
    status: accepted.length >= minimumComparables && medianArs ? 'live' : 'insufficient',
    query,
    matchMode,
    categoryId: categoryHint?.categoryId || null,
    categoryName: categoryHint?.categoryName || null,
    rawCount: raw.length,
    comparableCount: accepted.length,
    effectivePriceCount,
    p25Ars,
    medianArs,
    p75Ars,
    suggestedPriceArs,
    confidence,
    source: `${evidenceSource}${resolverSuffix}`,
    priceQuality,
    comparables: accepted.sort((a, b) => b.score - a.score).slice(0, 8),
    warnings,
  }
}
