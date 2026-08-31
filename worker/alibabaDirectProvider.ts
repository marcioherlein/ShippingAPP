import { extractAlibabaDirectFacts, type AlibabaDirectFacts } from './alibabaDirectExtract'
import { corroborateAlibabaPublicListing, type AlibabaPublicCorroborationResult } from './alibabaPublicCorroboration'
import { corroborateAlibabaHighSignalRoutes } from './alibabaHighSignalCorroboration'

export type DirectAlibabaResult =
  | { status: 'ready' | 'partial'; source: 'ShippingAPP direct Alibaba'; facts: AlibabaDirectFacts; httpStatus: number; warnings: string[] }
  | { status: 'unavailable'; source: 'ShippingAPP direct Alibaba'; facts: null; httpStatus: number | null; warnings: string[] }

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type CorroborationReader = (
  url: URL,
  hints: { name?: string | null; category?: string | null },
  fetchImpl: FetchLike,
) => Promise<AlibabaPublicCorroborationResult>

function coreSignals(facts: AlibabaDirectFacts) {
  return [
    facts.name,
    facts.category,
    facts.unitPriceUsd,
    facts.moq,
    facts.packedWeightKg,
    facts.volumeCbm,
    facts.originCountry,
  ].filter(Boolean).length
}

function productTitleFromUrl(url: URL) {
  const segment = url.pathname.split('/').filter(Boolean).at(-1) || ''
  const withoutId = segment
    .replace(/_\d{8,}\.html$/i, '')
    .replace(/\.html$/i, '')
  let decoded = withoutId
  try { decoded = decodeURIComponent(withoutId) } catch { /* keep encoded slug */ }
  const title = decoded.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!title || /^(?:product|product detail|detail)$/i.test(title)) return null
  return title.slice(0, 700)
}

function preserveUrlIdentity(facts: AlibabaDirectFacts, url: URL) {
  if (facts.name) return facts
  const name = productTitleFromUrl(url)
  if (!name) return facts
  return {
    ...facts,
    name,
    evidence: [...new Set([...facts.evidence, 'url_slug_title'])],
  }
}

function mergePublicCorroboration(
  facts: AlibabaDirectFacts,
  publicResult: Extract<AlibabaPublicCorroborationResult, { status: 'ready' }>,
): AlibabaDirectFacts {
  const publicFacts = publicResult.facts
  return {
    ...facts,
    name: facts.name || publicFacts.name,
    category: facts.category || publicFacts.category,
    unitPriceUsd: facts.unitPriceUsd ?? publicFacts.unitPriceUsd,
    moq: facts.moq ?? publicFacts.moq,
    supplier: facts.supplier || publicFacts.supplier,
    evidence: [...new Set([
      ...facts.evidence,
      ...publicFacts.evidence.map((item) => `public_listing:${item}`),
    ])],
  }
}

export function directAlibabaCoreSignals(facts: AlibabaDirectFacts) {
  return coreSignals(facts)
}

export async function extractAlibabaDirectHttp(
  url: URL,
  fetchImpl: FetchLike = fetch,
  corroborationReader: CorroborationReader = corroborateAlibabaPublicListing,
  highSignalReader: CorroborationReader = corroborateAlibabaHighSignalRoutes,
): Promise<DirectAlibabaResult> {
  let response: Response
  try {
    response = await fetchImpl(url.toString(), {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ShippingAPP/3.0; +https://shippingapp.marciofabrizio.workers.dev)',
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
      },
      redirect: 'follow',
    })
  } catch (error) {
    return {
      status: 'unavailable', source: 'ShippingAPP direct Alibaba', facts: null, httpStatus: null,
      warnings: [`Direct Alibaba fetch failed: ${error instanceof Error ? error.message : 'unknown error'}`],
    }
  }

  if (!response.ok) {
    return {
      status: 'unavailable', source: 'ShippingAPP direct Alibaba', facts: null, httpStatus: response.status,
      warnings: [`Direct Alibaba fetch returned HTTP ${response.status}.`],
    }
  }

  let html = ''
  try { html = await response.text() } catch {
    return {
      status: 'unavailable', source: 'ShippingAPP direct Alibaba', facts: null, httpStatus: response.status,
      warnings: ['Direct Alibaba response could not be read as text.'],
    }
  }

  if (!html || html.length < 80) {
    return {
      status: 'unavailable', source: 'ShippingAPP direct Alibaba', facts: null, httpStatus: response.status,
      warnings: ['Direct Alibaba response was empty or too small to contain product evidence.'],
    }
  }

  const extracted = extractAlibabaDirectFacts(html, url)
  let facts = preserveUrlIdentity(extracted, url)
  const corroborationWarnings: string[] = []
  const hints = { name: facts.name, category: facts.category }

  // Alibaba product-detail HTML is frequently sparse while its public
  // category/showroom/wholesale cards still expose the exact product id, price
  // range and MOQ. Before spending Parse.bot or Browser Run credits, try those
  // public surfaces. Only an exact product_id match can contribute facts.
  if (coreSignals(facts) < 7) {
    try {
      const publicResult = await corroborationReader(url, hints, fetchImpl)
      corroborationWarnings.push(...publicResult.warnings)
      if (publicResult.status === 'ready') facts = mergePublicCorroboration(facts, publicResult)
    } catch (error) {
      corroborationWarnings.push(`Alibaba public listing corroboration failed safely: ${error instanceof Error ? error.message : 'unknown error'}.`)
    }
  }

  // Full-title search routes often miss Alibaba's shorter SEO index route. If
  // the ficha is still incomplete, derive technical routes such as `100m-watch`
  // or `65w-charger`. Exact product_id matching remains mandatory, so this can
  // improve recall without borrowing facts from a similar listing.
  if (coreSignals(facts) < 7) {
    try {
      const highSignalResult = await highSignalReader(url, { name: facts.name, category: facts.category }, fetchImpl)
      corroborationWarnings.push(...highSignalResult.warnings)
      if (highSignalResult.status === 'ready') facts = mergePublicCorroboration(facts, highSignalResult)
    } catch (error) {
      corroborationWarnings.push(`Alibaba high-signal public corroboration failed safely: ${error instanceof Error ? error.message : 'unknown error'}.`)
    }
  }

  const signals = coreSignals(facts)
  const identity = Boolean(facts.name || facts.category)
  if (!identity || facts.evidence.length < 2) {
    return {
      status: 'unavailable', source: 'ShippingAPP direct Alibaba', facts: null, httpStatus: response.status,
      warnings: ['Direct Alibaba HTML/public listings did not expose enough trustworthy product evidence.', ...corroborationWarnings],
    }
  }

  const warnings: string[] = [...corroborationWarnings]
  if (facts.evidence.includes('url_slug_title') && !extracted.name) {
    warnings.push('Alibaba bloqueó o no expuso el título en HTML; ShippingAPP preservó como identidad provisional el título explícito del URL. El usuario debe confirmarlo antes de NCM.')
  }
  if (facts.evidence.some((item) => item.startsWith('public_listing:'))) {
    warnings.push('ShippingAPP corroboró datos comerciales en una superficie pública de Alibaba usando el mismo product_id; siguen sujetos a confirmación obligatoria antes de NCM/economics.')
  }
  if (!facts.packedWeightKg) warnings.push('Peso unitario embalado no expuesto por la lectura pública directa.')
  if (!facts.volumeCbm) warnings.push('Volumen/dimensiones logísticas no expuestos por la lectura pública directa.')
  if (!facts.originCountry) warnings.push('Origen de la mercadería no expuesto por la lectura pública directa.')
  if (!facts.unitPriceUsd) warnings.push('Precio unitario no expuesto/corroborado por la lectura pública directa.')
  if (!facts.moq) warnings.push('MOQ no expuesto/corroborado por la lectura pública directa.')

  return {
    status: signals >= 7 ? 'ready' : 'partial',
    source: 'ShippingAPP direct Alibaba',
    facts,
    httpStatus: response.status,
    warnings,
  }
}
