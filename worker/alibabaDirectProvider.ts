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

const VISIBLE_SPEC_LABELS = [
  'Country of Origin',
  'Place of Origin',
  'Movement Brand',
  'Product Type',
  'Case Material',
  'Main Material',
  'Model Number',
  'Material',
  'Movement',
  'Function',
  'Power',
  'Type',
] as const

const VISIBLE_SPEC_LABEL_PATTERN = VISIBLE_SPEC_LABELS
  .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

function normalizeSpecKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function decodeVisibleHtml(value: string) {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
}

function stripNextVisibleLabel(value: string | null) {
  if (!value) return value
  const nextLabel = new RegExp(`\\s+(?:${VISIBLE_SPEC_LABEL_PATTERN})\\s*[:：]`, 'i')
  const cut = value.search(nextLabel)
  return (cut >= 0 ? value.slice(0, cut) : value).replace(/\s+/g, ' ').trim() || null
}

/**
 * Alibaba often renders specs as neighbouring DOM rows. Flattening the whole
 * page to one line can make `Place of Origin: China Material: ABS ...` look like
 * a single value. Recover row boundaries from the HTML before those tags are
 * removed, and use them only to repair/complete explicit product attributes.
 */
function visibleSpecRows(html: string) {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const segmented = decodeVisibleHtml(withoutScripts)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|li|p|tr|td|th|dd|dt|span|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  const rows = new Map<string, { name: string; value: string }>()
  const labelled = new RegExp(`^\\s*(${VISIBLE_SPEC_LABEL_PATTERN})\\s*[:：]\\s*(.+?)\\s*$`, 'i')
  const bareLabel = new RegExp(`^\\s*(${VISIBLE_SPEC_LABEL_PATTERN})\\s*[:：]?\\s*$`, 'i')
  const lines = segmented.split(/\n+/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const direct = line.match(labelled)
    if (direct) {
      const value = stripNextVisibleLabel(direct[2])
      if (value) rows.set(normalizeSpecKey(direct[1]), { name: direct[1], value })
      continue
    }
    const labelOnly = line.match(bareLabel)
    if (!labelOnly || !lines[i + 1]) continue
    const next = stripNextVisibleLabel(lines[i + 1])
    if (next && !bareLabel.test(next)) rows.set(normalizeSpecKey(labelOnly[1]), { name: labelOnly[1], value: next })
  }
  return rows
}

function repairVisibleSpecSpill(facts: AlibabaDirectFacts, html: string): AlibabaDirectFacts {
  const rows = visibleSpecRows(html)
  const specifications: Array<{ name: string; value: string }> = []
  const seen = new Set<string>()
  const push = (name: string, value: string | null) => {
    const cleaned = stripNextVisibleLabel(value)
    if (!cleaned) return
    const key = normalizeSpecKey(name)
    const id = `${key}=${cleaned.toLowerCase()}`
    if (seen.has(id)) return
    seen.add(id)
    specifications.push({ name, value: cleaned })
  }

  for (const spec of facts.specifications) push(spec.name, spec.value)
  for (const row of rows.values()) push(row.name, row.value)

  const rowValue = (...names: string[]) => {
    for (const name of names) {
      const row = rows.get(normalizeSpecKey(name))
      if (row?.value) return row.value
      const spec = specifications.find((item) => normalizeSpecKey(item.name) === normalizeSpecKey(name))
      if (spec?.value) return spec.value
    }
    return null
  }

  const repairedOrigin = rowValue('Place of Origin', 'Country of Origin') || stripNextVisibleLabel(facts.originCountry)
  const repairedMaterial = rowValue('Material', 'Case Material', 'Main Material') || stripNextVisibleLabel(facts.material)
  const repairedFunction = rowValue('Product Type', 'Function', 'Type', 'Movement') || stripNextVisibleLabel(facts.functionText)

  return {
    ...facts,
    originCountry: repairedOrigin,
    material: repairedMaterial,
    functionText: repairedFunction,
    specifications,
  }
}

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
        'user-agent': 'Mozilla/5.0 (compatible; ShippingAPP/3.1; +https://shippingapp.marciofabrizio.workers.dev)',
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
  let facts = preserveUrlIdentity(repairVisibleSpecSpill(extracted, html), url)
  const corroborationWarnings: string[] = []
  const hints = { name: facts.name, category: facts.category }

  // First free pass: broad public Alibaba category/showroom/search surfaces.
  // An exact product_id match is mandatory before any commerce fact is merged.
  if (coreSignals(facts) < 7) {
    try {
      const publicResult = await corroborationReader(url, hints, fetchImpl)
      corroborationWarnings.push(...publicResult.warnings)
      if (publicResult.status === 'ready') facts = mergePublicCorroboration(facts, publicResult)
    } catch (error) {
      corroborationWarnings.push(`Alibaba public listing corroboration failed safely: ${error instanceof Error ? error.message : 'unknown error'}.`)
    }
  }

  // Second free pass: compact technical routes such as `100m-watch`, `65w-charger`
  // or `128gb-phone`. These are derived only from explicit title tokens, and the
  // same exact product_id gate prevents facts leaking from neighbouring SKUs.
  if (coreSignals(facts) < 7) {
    try {
      const highSignalResult = await highSignalReader(url, hints, fetchImpl)
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
