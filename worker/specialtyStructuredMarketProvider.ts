import { cleanText, comparableScore } from './catalogMatch'
import { functionalComparableScore, inferArgentinaMarketMatchMode } from './functionalMarketMatch'
import { passesFunctionalTraitEvidence } from './functionalTraitEvidence'
import type {
  ArgentinaMarketCandidate,
  ArgentinaMarketDiscoveryContext,
  ArgentinaMarketDiscoveryProvider,
  ArgentinaMarketDiscoveryResult,
} from './marketProviderContracts'
import type { MlResult } from './marketTypes'
import { createShopifyRetailerMarketProvider } from './shopifyRetailerMarketProvider'
import { createArgentinaDirectRetailerProvider, type ArgentinaVtexRetailer } from './vtexRetailerMarketProvider'

const LIVE_FLOOR = 5

const SONY_STORE: ArgentinaVtexRetailer = {
  id: 'sony-store-ar',
  name: 'Sony Store Argentina',
  baseUrl: 'https://store.sony.com.ar',
  tradePolicy: '1',
  maxCandidates: 12,
}

const KARCHER_STORE: ArgentinaVtexRetailer = {
  id: 'karcher-online-ar',
  name: 'Kärcher Online Argentina',
  baseUrl: 'https://www.karcheronline.com.ar',
  tradePolicy: '1',
  maxCandidates: 12,
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

function acceptedMatchCount(candidates: ArgentinaMarketCandidate[], context: ArgentinaMarketDiscoveryContext) {
  const mode = inferArgentinaMarketMatchMode(context.productName, context.category)
  const seen = new Set<string>()
  let accepted = 0
  for (const candidate of candidates) {
    if (!candidate?.id || seen.has(candidate.id)) continue
    seen.add(candidate.id)
    if (mode === 'functional' && !passesFunctionalTraitEvidence(candidate, context.productName)) continue
    const score = mode === 'functional'
      ? functionalComparableScore(matcherItem(candidate), context.productName, context.category)
      : comparableScore(matcherItem(candidate), context.productName, context.category)
    if (score >= 55) accepted += 1
  }
  return accepted
}

function specialtyKeys(context: ArgentinaMarketDiscoveryContext) {
  const identity = cleanText(`${context.productName} ${context.category}`)
  const keys: Array<'sony' | 'karcher' | 'logitech'> = []
  if (/\bsony\b/.test(identity)) keys.push('sony')
  if (/\bkarcher\b/.test(identity)) keys.push('karcher')
  if (/\blogitech\b/.test(identity)) keys.push('logitech')
  return keys
}

function candidateKey(candidate: ArgentinaMarketCandidate) {
  if (candidate.catalogProductId) return `catalog:${candidate.catalogProductId}`
  if (candidate.id) return `id:${candidate.id}`
  return `title:${cleanText(candidate.title)}:${candidate.sellerKey || 'x'}`
}

function mergeCandidates(results: ArgentinaMarketDiscoveryResult[]) {
  const merged: ArgentinaMarketCandidate[] = []
  const seen = new Set<string>()
  for (const result of results) {
    for (const candidate of result.candidates || []) {
      const key = candidateKey(candidate)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(candidate)
    }
  }
  return merged
}

export type SpecialtyStructuredFallbackOptions = {
  fetchImpl?: typeof fetch
}

/**
 * Adds official structured storefront evidence only for Sony, Kärcher and
 * Logitech products that are still below the five deterministic matches needed
 * for a live benchmark. Generic products and already-covered branded products
 * keep the original provider-only path.
 */
export function withArgentinaSpecialtyStructuredFallback(
  baseProvider: ArgentinaMarketDiscoveryProvider,
  options: SpecialtyStructuredFallbackOptions = {},
): ArgentinaMarketDiscoveryProvider {
  const fetchImpl = options.fetchImpl || fetch
  const sonyProvider = createArgentinaDirectRetailerProvider({ fetchImpl, retailers: [SONY_STORE] })
  const karcherProvider = createArgentinaDirectRetailerProvider({ fetchImpl, retailers: [KARCHER_STORE] })
  const logitechProvider = createShopifyRetailerMarketProvider({
    fetchImpl,
    retailer: {
      id: 'logitech-store-ar',
      name: 'Logitech Store Argentina',
      baseUrl: 'https://www.logitechargentina.com.ar',
      maxCandidates: 12,
    },
  })

  return {
    id: `${baseProvider.id}+specialty-structured-fallback`,
    async discover(context) {
      const base = await baseProvider.discover(context)
      const baseMatches = acceptedMatchCount(base.candidates || [], context)
      if (baseMatches >= LIVE_FLOOR) return base

      const keys = specialtyKeys(context)
      if (!keys.length) return base

      const selected = keys.map((key) => key === 'sony' ? sonyProvider : key === 'karcher' ? karcherProvider : logitechProvider)
      const supplements = await Promise.all(selected.map(async (provider) => {
        try {
          return await provider.discover(context)
        } catch (error) {
          return {
            providerId: provider.id,
            sourceLabel: provider.id,
            candidates: [],
            categoryHint: null,
            warnings: [error instanceof Error ? error.message : `${provider.id} specialty discovery failed.`],
          } satisfies ArgentinaMarketDiscoveryResult
        }
      }))
      const all = [base, ...supplements]
      const candidates = mergeCandidates(all)
      const contributors = all.filter((result) => result.candidates?.length)
      return {
        ...base,
        candidates,
        sourceLabel: contributors.map((result) => result.sourceLabel).join(' + '),
        warnings: [
          ...(base.warnings || []),
          ...supplements.flatMap((result) => result.warnings || []),
          `Official structured specialty-store fallback ran because base discovery produced ${baseMatches}/${LIVE_FLOOR} deterministic match(es). Candidate acceptance thresholds were not relaxed.`,
        ],
      }
    },
  }
}
