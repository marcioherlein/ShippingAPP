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
  graphite: 'grafito',
  storage: 'organizador',
  box: 'caja',
}

const PROOF_REQUIRED_QUERY_TERMS = new Set([
  'carbon', 'grafito', 'gps', 'inalambrico', 'electrico', 'frontal', '4k', 'qled', 'oled',
  'bluetooth', 'inverter', 'anc', 'exterior', 'ajustable', 'eva', 'diamante', 'redonda', 'lagrima',
])
const RELAXABLE_SPEC_TOKEN = /^\d+(?:\.\d+)?(?:tb|gb|mb|mah|w|kw|v|hz|kg|g|l|ml|cm|mm|pa|bar|mp|inch)$/

function localizeToken(token: string, category: string) {
  if (token === 'racket' && /\btenis\b/i.test(category)) return 'raqueta'
  return ARGENTINA_STOREFRONT_TERMS[token] || token
}

function localizeQuery(query: string, category: string) {
  return [...new Set(query
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => localizeToken(token, category)))]
}

function categoryQueryTokens(category: string) {
  return localizeQuery(buildFunctionalMarketQuery('', category), category)
}

export function buildArgentinaFunctionalMarketQuery(productName: string, category: string) {
  return localizeQuery(buildFunctionalMarketQuery(productName, category), category).slice(0, 8).join(' ')
}

export function buildArgentinaFunctionalMarketQueries(productName: string, category: string) {
  const strictTokens = localizeQuery(buildFunctionalMarketQuery(productName, category), category).slice(0, 8)
  const strict = strictTokens.join(' ')
  const categoryTokens = categoryQueryTokens(category)
  const traitTokens = strictTokens.filter((token) => PROOF_REQUIRED_QUERY_TERMS.has(token))
  const specTokens = strictTokens.filter((token) => RELAXABLE_SPEC_TOKEN.test(token))
  const anchors = [...new Set([...categoryTokens, ...traitTokens])]
  const plans = [strict]

  for (const spec of specTokens) {
    plans.push([...new Set([...anchors, spec])].slice(0, 8).join(' '))
  }
  plans.push(anchors.slice(0, 8).join(' '))

  return [...new Set(plans.map((query) => query.trim()).filter((query) => query.length >= 2))]
}
