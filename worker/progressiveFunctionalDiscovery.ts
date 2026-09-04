import { cleanText } from './catalogMatch'
import { functionalComparableScore, inferArgentinaMarketMatchMode } from './functionalMarketMatch'
import { buildArgentinaFunctionalMarketQuery } from './functionalMarketQuery'
import { passesFunctionalTraitEvidence } from './functionalTraitEvidence'
import type {
  ArgentinaMarketCandidate,
  ArgentinaMarketDiscoveryProvider,
  ArgentinaMarketDiscoveryResult,
} from './marketProviderContracts'
import type { MlResult } from './marketTypes'

const LIVE_FLOOR = 5
const DIRECT_RETAILER_SOURCE_PREFIX = 'Retailers argentinos directos · '

export type ProgressiveFunctionalDiscoveryOptions = {
  relaxedProvider?: ArgentinaMarketDiscoveryProvider | null
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matcherItem(candidate: ArgentinaMarketCandidate): MlResult {
  return {
    id: candidate.id,
    title: candidate.title,
    price: candidate.priceArs,
    currency_id: 'ARS',
    condition: candidate.condition,
    category_id: candidate.categoryId,
    catalog_product_id: candidate.catalogProductId,
    permalink: candidate.permalink,
    attributes: candidate.attributes,
  }
}

function deterministicMatchCount(candidates: ArgentinaMarketCandidate[], productName: string, category: string) {
  const seen = new Set<string>()
  let count = 0
  for (const candidate of candidates) {
    if (!candidate?.id || seen.has(candidate.id)) continue
    seen.add(candidate.id)
    if (!passesFunctionalTraitEvidence(candidate, productName)) continue
    if (functionalComparableScore(matcherItem(candidate), productName, category) >= 55) count += 1
  }
  return count
}

function relaxedFunctionalQuery(category: string) {
  return (buildArgentinaFunctionalMarketQuery('', category) || cleanText(category)).trim()
}

function candidateKey(candidate: ArgentinaMarketCandidate) {
  if (candidate.catalogProductId) return `catalog:${candidate.catalogProductId}`
  if (candidate.id) return `id:${candidate.id}`
  return `title:${cleanText(candidate.title)}:${candidate.sellerKey || 'x'}`
}

function mergeCandidates(
  strict: ArgentinaMarketCandidate[],
  relaxed: ArgentinaMarketCandidate[],
  productName: string,
) {
  const merged: ArgentinaMarketCandidate[] = []
  const seen = new Set<string>()
  for (const candidate of [...strict, ...relaxed]) {
    if (!candidate || !passesFunctionalTraitEvidence(candidate, productName)) continue
    const key = candidateKey(candidate)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(candidate)
  }
  return merged
}

function directRetailerNames(sourceLabel: string) {
  if (!sourceLabel.startsWith(DIRECT_RETAILER_SOURCE_PREFIX)) return null
  return sourceLabel
    .slice(DIRECT_RETAILER_SOURCE_PREFIX.length)
    .split(' + ')
    .map((name) => name.trim())
    .filter(Boolean)
}

/**
 * Strict and relaxed retailer rounds can observe different subsets of healthy
 * storefronts. Keep one canonical source label instead of concatenating two
 * complete `Retailers argentinos directos · ...` strings, which obscures
 * provenance in benchmark output.
 */
export function mergeProgressiveSourceLabels(strictLabel: string, relaxedLabel: string) {
  if (strictLabel === relaxedLabel) return strictLabel
  const strictNames = directRetailerNames(strictLabel)
  const relaxedNames = directRetailerNames(relaxedLabel)
  if (!strictNames || !relaxedNames) return `${strictLabel} + ${relaxedLabel}`
  return `${DIRECT_RETAILER_SOURCE_PREFIX}${[...new Set([...strictNames, ...relaxedNames])].join(' + ')}`
}

function withWarning(result: ArgentinaMarketDiscoveryResult, warning: string): ArgentinaMarketDiscoveryResult {
  return { ...result, warnings: [...(result.warnings || []), warning] }
}

/**
 * Wrap only the free Argentine retailer provider. Exact-mode requests remain
 * single-shot. Functional requests get one category-only storefront query when
 * strict discovery cannot produce the five deterministic matches required for
 * a live benchmark. The optional relaxedProvider lets the caller use a smaller,
 * category-aware retailer set for that second round so query relaxation does
 * not multiply the full storefront fan-out. Candidate acceptance remains
 * fail-closed in the unchanged deterministic matcher plus shared critical-trait
 * evidence gate.
 */
export function withProgressiveFunctionalDiscovery(
  baseProvider: ArgentinaMarketDiscoveryProvider,
  options: ProgressiveFunctionalDiscoveryOptions = {},
): ArgentinaMarketDiscoveryProvider {
  return {
    id: baseProvider.id,
    async discover(context) {
      const strict = await baseProvider.discover(context)
      if (inferArgentinaMarketMatchMode(context.productName, context.category) !== 'functional') return strict

      const strictMatches = deterministicMatchCount(strict.candidates || [], context.productName, context.category)
      if (strictMatches >= LIVE_FLOOR) return strict

      const relaxedQuery = relaxedFunctionalQuery(context.category)
      if (!relaxedQuery || normalize(relaxedQuery) === normalize(context.query)) {
        return withWarning(
          strict,
          `Progressive functional discovery stayed single-shot because the strict query was already category-only; strict discovery produced ${strictMatches}/${LIVE_FLOOR} deterministic match(es).`,
        )
      }

      const relaxedProvider = options.relaxedProvider || baseProvider
      let relaxed: ArgentinaMarketDiscoveryResult
      try {
        relaxed = await relaxedProvider.discover({ ...context, query: relaxedQuery })
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'relaxed retailer discovery failed'
        return withWarning(
          strict,
          `Progressive functional discovery attempted category-only query "${relaxedQuery}" after ${strictMatches}/${LIVE_FLOOR} strict match(es), but the fallback failed (${reason}). Strict evidence was preserved.`,
        )
      }

      const candidates = mergeCandidates(strict.candidates || [], relaxed.candidates || [], context.productName)
      return {
        ...strict,
        sourceLabel: mergeProgressiveSourceLabels(strict.sourceLabel, relaxed.sourceLabel),
        candidates,
        categoryHint: strict.categoryHint || relaxed.categoryHint || null,
        warnings: [
          ...(strict.warnings || []),
          ...(relaxed.warnings || []),
          `Progressive functional discovery widened only the free retailer storefront query from "${context.query}" to category-only "${relaxedQuery}" because strict discovery produced ${strictMatches}/${LIVE_FLOOR} deterministic match(es). Every candidate still requires the original specs/category matcher plus shared critical-trait evidence before economics.`,
        ],
      }
    },
  }
}
