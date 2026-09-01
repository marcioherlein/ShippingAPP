import { cleanText } from './catalogMatch'
import { functionalComparableScore, inferArgentinaMarketMatchMode } from './functionalMarketMatch'
import { buildArgentinaFunctionalMarketQuery } from './functionalMarketQuery'
import type {
  ArgentinaMarketCandidate,
  ArgentinaMarketDiscoveryProvider,
  ArgentinaMarketDiscoveryResult,
} from './marketProviderContracts'
import type { MlResult } from './marketTypes'

const LIVE_FLOOR = 5
const SPEC_TOKEN = /^\d+(?:[.,]\d+)?(?:tb|gb|mb|mah|w|kw|v|hz|kg|g|l|ml|cm|mm|pa|bar|mp|inch)$/i

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function evidenceText(candidate: ArgentinaMarketCandidate) {
  return normalize([
    candidate.title,
    ...(candidate.attributes || []).flatMap((attribute) => [attribute.name || '', attribute.value_name || '']),
  ].join(' '))
}

function targetNeedsGps(productName: string) {
  return /\bgps\b/.test(normalize(productName))
}

function targetNeedsGraphite(productName: string) {
  return /\b(?:grafito|graphite)\b/.test(normalize(productName))
}

/**
 * Progressive discovery may widen only the storefront query. Any critical trait
 * that is not yet part of the core functional matcher must remain explicit in
 * visible title/spec evidence before the candidate is allowed into the merged
 * discovery pool.
 */
export function passesProgressiveTraitGuard(candidate: ArgentinaMarketCandidate, productName: string) {
  const evidence = evidenceText(candidate)
  if (targetNeedsGps(productName) && !/\bgps\b/.test(evidence)) return false
  if (targetNeedsGraphite(productName) && !/\b(?:grafito|graphite)\b/.test(evidence)) return false
  return true
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
    if (!passesProgressiveTraitGuard(candidate, productName)) continue
    if (functionalComparableScore(matcherItem(candidate), productName, category) >= 55) count += 1
  }
  return count
}

function relaxedFunctionalQuery(strictQuery: string, productName: string, category: string) {
  const categoryQuery = buildArgentinaFunctionalMarketQuery('', category) || cleanText(category)
  if (!categoryQuery) return ''

  const categoryTokens = new Set(categoryQuery.split(/\s+/).filter(Boolean))
  const strictTokens = strictQuery.split(/\s+/).filter(Boolean)
  const extras = strictTokens.filter((token) => !categoryTokens.has(token))
  const numericAnchor = extras.find((token) => SPEC_TOKEN.test(token))

  // When the strict query contains multiple constraints, keep one numeric anchor
  // to retain storefront relevance. With only one extra constraint, broaden to
  // category-only because that exact combination is what already failed.
  const tokens = extras.length >= 2 && numericAnchor
    ? [...categoryTokens, numericAnchor]
    : [...categoryTokens]
  return [...new Set(tokens)].join(' ').trim()
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
    if (!candidate || !passesProgressiveTraitGuard(candidate, productName)) continue
    const key = candidateKey(candidate)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(candidate)
  }
  return merged
}

function withWarning(
  result: ArgentinaMarketDiscoveryResult,
  warning: string,
): ArgentinaMarketDiscoveryResult {
  return {
    ...result,
    warnings: [...(result.warnings || []), warning],
  }
}

/**
 * Wrap only the free Argentine retailer provider. Exact-mode requests remain
 * single-shot. Functional requests get one broader storefront query only when
 * the strict query cannot produce the five deterministic matches required for
 * a live benchmark. The downstream matcher and price rules are unchanged.
 */
export function withProgressiveFunctionalDiscovery(
  baseProvider: ArgentinaMarketDiscoveryProvider,
): ArgentinaMarketDiscoveryProvider {
  return {
    id: baseProvider.id,
    async discover(context) {
      const strict = await baseProvider.discover(context)
      if (inferArgentinaMarketMatchMode(context.productName, context.category) !== 'functional') return strict

      const strictMatches = deterministicMatchCount(strict.candidates || [], context.productName, context.category)
      if (strictMatches >= LIVE_FLOOR) return strict

      const relaxedQuery = relaxedFunctionalQuery(context.query, context.productName, context.category)
      if (!relaxedQuery || normalize(relaxedQuery) === normalize(context.query)) {
        return withWarning(
          strict,
          `Progressive functional discovery stayed single-shot because no safer broader storefront query was available; strict discovery produced ${strictMatches}/${LIVE_FLOOR} deterministic match(es).`,
        )
      }

      let relaxed: ArgentinaMarketDiscoveryResult
      try {
        relaxed = await baseProvider.discover({ ...context, query: relaxedQuery })
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'relaxed retailer discovery failed'
        return withWarning(
          strict,
          `Progressive functional discovery attempted the safer broader query "${relaxedQuery}" after ${strictMatches}/${LIVE_FLOOR} strict match(es), but the fallback failed (${reason}). Strict evidence was preserved.`,
        )
      }

      const candidates = mergeCandidates(strict.candidates || [], relaxed.candidates || [], context.productName)
      const sourceLabel = strict.sourceLabel === relaxed.sourceLabel
        ? strict.sourceLabel
        : `${strict.sourceLabel} + ${relaxed.sourceLabel}`

      return {
        ...strict,
        sourceLabel,
        candidates,
        categoryHint: strict.categoryHint || relaxed.categoryHint || null,
        warnings: [
          ...(strict.warnings || []),
          ...(relaxed.warnings || []),
          `Progressive functional discovery widened only the free retailer storefront query from "${context.query}" to "${relaxedQuery}" because strict discovery produced ${strictMatches}/${LIVE_FLOOR} deterministic match(es). The unchanged deterministic matcher still gates every candidate before economics.`,
        ],
      }
    },
  }
}
