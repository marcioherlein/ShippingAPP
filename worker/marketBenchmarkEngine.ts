import { buildMarketQuery, cleanText, comparableScore } from './catalogMatch'
import {
  functionalComparableScore,
  inferArgentinaMarketMatchMode,
  type ArgentinaMarketMatchMode,
} from './functionalMarketMatch'
import { buildArgentinaFunctionalMarketQueries } from './functionalMarketQuery'
import { percentile, trimPriceOutliers } from './catalogStats'
import type { ArgentinaMarketResult, MarketComparable, MlResult } from './marketTypes'
import type {
  ArgentinaMarketCandidate,
  ArgentinaMarketCategoryHint,
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

function validCandidate(candidate: ArgentinaMarketCandidate) {
  return Boolean(candidate?.title && Number.isFinite(candidate.priceArs) && candidate.priceArs > 0)
}

function functionalScore(candidate: ArgentinaMarketCandidate, productName: string, category: string) {
  if (!validCandidate(candidate)) return 0
  return functionalComparableScore(asMatcherItem(candidate), productName, category)
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
  const queryPlan = matchMode === 'functional'
    ? buildArgentinaFunctionalMarketQueries(productName, category)
    : [buildExactDiscoveryQuery(productName, category)]
  const query = queryPlan[0] || defaultExactQuery
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

  const raw: ArgentinaMarketCandidate[] = []
  const rawSeen = new Set<string>()
  let categoryHint: ArgentinaMarketCategoryHint | null | undefined = null
  let sourceLabel = discoveryProvider.id
  let successfulDiscovery = false

  for (let stage = 0; stage < queryPlan.length; stage += 1) {
    const stageQuery = queryPlan[stage]
    try {
      const discovery = await discoveryProvider.discover({ query: stageQuery, productName, category })
      successfulDiscovery = true
      sourceLabel = discovery.sourceLabel || sourceLabel
      if (!categoryHint && discovery.categoryHint) categoryHint = discovery.categoryHint
      warnings.push(...(discovery.warnings || []))

      for (const candidate of Array.isArray(discovery.candidates) ? discovery.candidates : []) {
        if (matchMode !== 'functional') {
          raw.push(candidate)
          continue
        }
        const key = dedupeKey(candidate)
        if (rawSeen.has(key)) continue
        rawSeen.add(key)
        raw.push(candidate)
      }
    } catch (error) {
      if (stage === 0) {
        return emptyResult(
          'unavailable',
          query,
          matchMode,
          discoveryProvider.id,
          [...warnings, error instanceof Error ? error.message : 'Argentina market discovery provider failed'],
        )
      }
      warnings.push(`Progressive functional discovery query (${stageQuery}) failed; prior evidence was retained.`)
    }

    if (matchMode !== 'functional') break
    const provisionalAccepted = raw.filter((candidate) => functionalScore(candidate, productName, category) >= 55).length
    if (provisionalAccepted >= minimumComparables) break
    const nextQuery = queryPlan[stage + 1]
    if (nextQuery) {
      warnings.push(`Progressive functional discovery found ${provisionalAccepted} matcher-approved comparable(s) with query (${stageQuery}); relaxing discovery to (${nextQuery}) while keeping the same deterministic matcher and ${minimumComparables}-comparable live floor.`)
    }
  }

  if (!successfulDiscovery) {
    return emptyResult('unavailable', query, matchMode, discoveryProvider.id, warnings)
  }

  const seen = new Set<string>()
  const matched: Array<{ candidate: ArgentinaMarketCandidate; comparable: MarketComparable }> = []

  for (const candidate of raw) {
    if (!validCandidate(candidate)) continue
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
    source: `${sourceLabel}${resolverSuffix}`,
    priceQuality,
    comparables: accepted.sort((a, b) => b.score - a.score).slice(0, 8),
    warnings: [...new Set(warnings)],
  }
}
