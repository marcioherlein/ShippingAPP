import { buildFunctionalMarketQuery } from './functionalMarketMatch'

const ARGENTINA_STOREFRONT_TERMS: Record<string, string> = {
  vacuum: 'aspiradora',
  racket: 'paleta',
  phone: 'celular',
  drill: 'taladro',
  headphones: 'auriculares',
  speaker: 'parlante',
  blender: 'licuadora',
  wireless: 'inalambrico',
  electric: 'electrico',
  outdoor: 'exterior',
  adjustable: 'ajustable',
  storage: 'organizador',
  box: 'caja',
}

const FUNCTIONAL_DISCOVERY_SPEC_TOKEN = /^\d+(?:[.,]\d+)?(?:tb|gb|mb|mah|w|kw|v|hz|kg|g|l|ml|cm|mm|pa|bar|mp|inch)$/

function localizeFunctionalQuery(query: string) {
  const localized = query
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => ARGENTINA_STOREFRONT_TERMS[token] || token)
  return [...new Set(localized)].slice(0, 8).join(' ')
}

export function buildArgentinaFunctionalMarketQuery(productName: string, category: string) {
  return localizeFunctionalQuery(buildFunctionalMarketQuery(productName, category))
}

/**
 * Discovery may fail because a retailer storefront requires every query token
 * to be present in searchable text even when the missing evidence exists in
 * structured attributes. Widen discovery in deterministic stages while keeping
 * the downstream functional matcher completely unchanged.
 *
 * Stage 1: current strict query (category + required traits + explicit specs)
 * Stage 2: same semantic query without numeric specification tokens
 * Stage 3: category-only storefront query
 */
export function buildArgentinaFunctionalDiscoveryQueries(productName: string, category: string) {
  const strict = buildArgentinaFunctionalMarketQuery(productName, category)
  const relaxed = strict
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !FUNCTIONAL_DISCOVERY_SPEC_TOKEN.test(token))
    .slice(0, 6)
    .join(' ')
  const categoryOnly = buildArgentinaFunctionalMarketQuery('', category || productName)
  return [...new Set([strict, relaxed, categoryOnly].map((query) => query.trim()).filter(Boolean))]
}
