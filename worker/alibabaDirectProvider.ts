import { extractAlibabaDirectFacts, type AlibabaDirectFacts } from './alibabaDirectExtract'

export type DirectAlibabaResult =
  | { status: 'ready' | 'partial'; source: 'ShippingAPP direct Alibaba'; facts: AlibabaDirectFacts; httpStatus: number; warnings: string[] }
  | { status: 'unavailable'; source: 'ShippingAPP direct Alibaba'; facts: null; httpStatus: number | null; warnings: string[] }

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

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

export function directAlibabaCoreSignals(facts: AlibabaDirectFacts) {
  return coreSignals(facts)
}

export async function extractAlibabaDirectHttp(
  url: URL,
  fetchImpl: FetchLike = fetch,
): Promise<DirectAlibabaResult> {
  let response: Response
  try {
    response = await fetchImpl(url.toString(), {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ShippingAPP/2.0; +https://shippingapp.marciofabrizio.workers.dev)',
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
  const facts = preserveUrlIdentity(extracted, url)
  const signals = coreSignals(facts)
  const identity = Boolean(facts.name || facts.category)
  if (!identity || facts.evidence.length < 2) {
    return {
      status: 'unavailable', source: 'ShippingAPP direct Alibaba', facts: null, httpStatus: response.status,
      warnings: ['Direct Alibaba HTML did not expose enough trustworthy product evidence.'],
    }
  }

  const warnings: string[] = []
  if (facts.evidence.includes('url_slug_title') && !extracted.name) {
    warnings.push('Alibaba bloqueó o no expuso el título en HTML; ShippingAPP preservó como identidad provisional el título explícito del URL. El usuario debe confirmarlo antes de NCM.')
  }
  if (!facts.packedWeightKg) warnings.push('Peso unitario embalado no expuesto por el fetch directo.')
  if (!facts.volumeCbm) warnings.push('Volumen/dimensiones logísticas no expuestos por el fetch directo.')
  if (!facts.originCountry) warnings.push('Origen de la mercadería no expuesto por el fetch directo.')
  if (!facts.unitPriceUsd) warnings.push('Precio unitario no expuesto por el fetch directo.')
  if (!facts.moq) warnings.push('MOQ no expuesto por el fetch directo.')

  return {
    status: signals >= 7 ? 'ready' : 'partial',
    source: 'ShippingAPP direct Alibaba',
    facts,
    httpStatus: response.status,
    warnings,
  }
}
