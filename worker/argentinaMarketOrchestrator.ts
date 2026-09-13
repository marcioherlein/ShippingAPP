import { analyzeArgentinaMarket } from './catalogProvider'
import { inferArgentinaMarketMatchMode } from './functionalMarketMatch'
import { withFunctionalTraitEvidenceGuard } from './functionalTraitEvidence'
import { createGoogleShoppingArgentinaProvider } from './googleShoppingMarketProvider'
import { runArgentinaMarketBenchmark } from './marketBenchmarkEngine'
import { createMercadoLibreMarketProviders } from './mercadoLibreMarketProvider'
import type { ArgentinaMarketPriceResolver } from './marketProviderContracts'
import type { ArgentinaMarketResult } from './marketTypes'
import { withProgressiveFunctionalDiscovery } from './progressiveFunctionalDiscovery'
import {
  createArgentinaDirectRetailerProvider,
  DEFAULT_ARGENTINA_VTEX_RETAILERS,
  SPECIALIZED_ARGENTINA_VTEX_RETAILERS,
  type ArgentinaVtexRetailer,
} from './vtexRetailerMarketProvider'

export type ArgentinaMarketHybridOptions = {
  mercadoLibreAccessToken?: string | null
  googleShoppingApiKey?: string | null
  fetchImpl?: typeof fetch
  salePriceLookupLimit?: number
}

const FUNCTIONAL_RELAXED_CORE_IDS = new Set(['fravega', 'cetrogar', 'naldo', 'oncity', 'pardo'])

function normalizeCategory(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Progressive discovery's second query is deliberately broader than the first,
 * so it must not fan out to every configured storefront again. Keep the five
 * historically productive generalists and add only category-relevant stores.
 * The strict round still uses every retailer; this only bounds the relaxed
 * category-only fallback.
 */
export function selectFunctionalRelaxedRetailers(category: string): ArgentinaVtexRetailer[] {
  const normalized = normalizeCategory(category)
  const selected = new Set(FUNCTIONAL_RELAXED_CORE_IDS)

  if (/\b(?:paleta|padel|tenis|raqueta|mancuerna|deporte|fitness|gimnasia|zapatilla|calzado)\b/.test(normalized)) {
    selected.add('sportline')
  }
  if (/\b(?:taladro|amoladora|hidrolavadora|herramienta|aspiradora|ventilador|termotanque|plancha|hogar)\b/.test(normalized)) {
    selected.add('easy')
  }
  if (/\b(?:lavarropas|heladera|microondas|freidora|pava|licuadora|tostadora|cafetera|electrodomestico|electrodomesticos|cocina|hogar|termotanque)\b/.test(normalized)) {
    selected.add('carrefour')
  }
  if (/\b(?:auricular|auriculares|parlante|audio|televisor|tv|camara|smartwatch|power bank|celular|notebook|router|impresora)\b/.test(normalized)) {
    selected.add('coppel')
  }
  if (/\b(?:auricular|auriculares|audio|sony|televisor|tv)\b/.test(normalized)) {
    selected.add('sony-official')
  }

  const all = [...DEFAULT_ARGENTINA_VTEX_RETAILERS, ...SPECIALIZED_ARGENTINA_VTEX_RETAILERS]
  return all.filter((retailer) => selected.has(retailer.id)).slice(0, 7)
}

function isMercadoLibreItemId(value: string) {
  return /^MLA\d{6,}$/.test(value)
}

function fallbackRank(result: ArgentinaMarketResult) {
  if (result.status === 'live') return 4
  if (result.status === 'insufficient') return 3
  if (result.status === 'unavailable') return 2
  return 1
}

function chooseNonLive(...results: ArgentinaMarketResult[]) {
  return [...results].sort((left, right) => {
    const rankDelta = fallbackRank(right) - fallbackRank(left)
    if (rankDelta) return rankDelta
    return right.comparableCount - left.comparableCount
  })[0]
}

function evidenceSummary(label: string, result: ArgentinaMarketResult) {
  return `${label} returned ${result.status} with ${result.comparableCount} accepted comparable(s)`
}

async function analyzeDirectRetailers(
  productName: string,
  category: string,
  options: ArgentinaMarketHybridOptions,
) {
  const retailerBase = withFunctionalTraitEvidenceGuard(createArgentinaDirectRetailerProvider({
    fetchImpl: options.fetchImpl,
  }))
  const relaxedRetailerBase = withFunctionalTraitEvidenceGuard(createArgentinaDirectRetailerProvider({
    fetchImpl: options.fetchImpl,
    retailers: selectFunctionalRelaxedRetailers(category),
  }))
  const retailerProvider = withProgressiveFunctionalDiscovery(retailerBase, {
    relaxedProvider: relaxedRetailerBase,
  })
  return runArgentinaMarketBenchmark(productName, category, retailerProvider)
}

export async function analyzeArgentinaMarketHybrid(
  productName: string,
  category: string,
  options: ArgentinaMarketHybridOptions = {},
): Promise<ArgentinaMarketResult> {
  const accessToken = options.mercadoLibreAccessToken?.trim() || null
  const googleShoppingApiKey = options.googleShoppingApiKey?.trim() || null
  const matchMode = inferArgentinaMarketMatchMode(productName, category)

  // Functional/private-label discovery can require two bounded retailer rounds
  // (strict + category-only). Running Mercado Libre's currently degraded catalog
  // hydration first can consume another large block of subrequests and push the
  // whole intake above the Cloudflare Worker budget. Keep the same deterministic
  // matcher, but prioritize the free direct-retailer evidence and skip ML network
  // discovery entirely for functional mode. Mercado Libre remains primary for
  // exact SKU/model requests and retains its dedicated production diagnostic.
  if (matchMode === 'functional') {
    const retailers = await analyzeDirectRetailers(productName, category, options)
    if (retailers.status === 'live') {
      retailers.warnings.unshift(
        'Functional benchmark used direct Argentine retailers first; Mercado Libre discovery was skipped to keep the multi-store search within the Worker subrequest budget. Every accepted comparable still passed the deterministic functional matcher and critical-trait evidence gate.',
      )
      return retailers
    }

    if (!googleShoppingApiKey) {
      retailers.warnings.push(
        `Functional benchmark remained fail-closed after direct retailer discovery (${retailers.comparableCount} accepted comparable(s)); Mercado Libre was intentionally skipped to preserve the Worker subrequest budget and no paid Google Shopping fallback is configured.`,
      )
      return retailers
    }

    const googleProvider = withFunctionalTraitEvidenceGuard(createGoogleShoppingArgentinaProvider({
      apiKey: googleShoppingApiKey,
      fetchImpl: options.fetchImpl,
    }))
    const google = await runArgentinaMarketBenchmark(productName, category, googleProvider)
    if (google.status === 'live') {
      google.warnings.unshift(
        `${evidenceSummary('Direct retailer discovery', retailers)}; Google Shopping Argentina fallback produced the functional benchmark. Mercado Libre discovery was skipped to preserve the Worker subrequest budget.`,
      )
      return google
    }

    const chosen = chooseNonLive(retailers, google)
    chosen.warnings.push(
      `Functional market evidence did not reach the live floor. ${evidenceSummary('Direct retailers', retailers)}; ${evidenceSummary('Google Shopping', google)}. Mercado Libre discovery was skipped to preserve the Worker subrequest budget.`,
    )
    return chosen
  }

  const primary = await analyzeArgentinaMarket(productName, category, {
    accessToken,
    fetchImpl: options.fetchImpl,
    salePriceLookupLimit: options.salePriceLookupLimit,
  })

  if (primary.status === 'live') return primary

  const retailers = await analyzeDirectRetailers(productName, category, options)

  if (retailers.status === 'live') {
    retailers.warnings.unshift(
      `${evidenceSummary('Mercado Libre primary discovery', primary)}; direct Argentine retailers produced the live benchmark without a paid search API.`,
    )
    return retailers
  }

  if (!googleShoppingApiKey) {
    const chosen = chooseNonLive(primary, retailers)
    chosen.warnings.push(
      `Secondary Argentina market evidence also did not reach the live floor. Free discovery summary: ${evidenceSummary('Mercado Libre', primary)}; ${evidenceSummary('direct retailers', retailers)}.`,
    )
    return chosen
  }

  const googleProvider = withFunctionalTraitEvidenceGuard(createGoogleShoppingArgentinaProvider({
    apiKey: googleShoppingApiKey,
    fetchImpl: options.fetchImpl,
  }))

  let effectivePriceResolver: ArgentinaMarketPriceResolver | null = null
  if (accessToken) {
    const { priceResolver } = createMercadoLibreMarketProviders({
      accessToken,
      fetchImpl: options.fetchImpl,
    })
    effectivePriceResolver = {
      id: 'Mercado Libre effective sale_price for discovered MLA items',
      async resolve(candidate) {
        if (!isMercadoLibreItemId(candidate.id)) return null
        return priceResolver.resolve(candidate)
      },
    }
  }

  const google = await runArgentinaMarketBenchmark(productName, category, googleProvider, {
    priceResolver: effectivePriceResolver,
    priceLookupLimit: Math.max(0, Math.min(30, options.salePriceLookupLimit ?? 24)),
  })

  if (google.status === 'live') {
    google.warnings.unshift(
      `${evidenceSummary('Mercado Libre primary discovery', primary)}; ${evidenceSummary('direct retailer discovery', retailers)}; Google Shopping Argentina fallback produced the live benchmark.`,
    )
    return google
  }

  const chosen = chooseNonLive(primary, retailers, google)
  chosen.warnings.push(
    `Secondary Argentina market evidence also did not reach the live floor. Argentina market summary: ${evidenceSummary('Mercado Libre', primary)}; ${evidenceSummary('direct retailers', retailers)}; ${evidenceSummary('Google Shopping', google)}.`,
  )
  return chosen
}
