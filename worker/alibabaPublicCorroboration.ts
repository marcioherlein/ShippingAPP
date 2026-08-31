import { buildAlibabaSearchUrl, buildAlibabaSeoSearchUrls, canonicalAlibabaProductUrl, titleFromAlibabaProductUrl } from './productDiscovery'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type AlibabaPublicCorroborationFacts = {
  name: string | null
  category: string | null
  unitPriceUsd: number | null
  priceRangeUsd: { min: number; max: number } | null
  moq: number | null
  supplier: string | null
  productId: string
  sourceUrl: string
  evidence: string[]
}

export type AlibabaPublicCorroborationResult =
  | {
      status: 'ready'
      source: 'Alibaba public listing corroboration'
      facts: AlibabaPublicCorroborationFacts
      pagesAttempted: number
      warnings: string[]
    }
  | {
      status: 'unavailable'
      source: 'Alibaba public listing corroboration'
      facts: null
      pagesAttempted: number
      warnings: string[]
    }

const BOT_PATTERNS = [
  /captcha/i,
  /verify (?:that )?you are human/i,
  /unusual traffic/i,
  /access denied/i,
  /robot check/i,
  /security verification/i,
]

const QUERY_NOISE = new Set([
  'fully', 'high', 'quality', 'new', 'hot', 'sale', 'wholesale', 'factory', 'oem', 'odm',
  'green', 'dial', 'waterproof', 'stainless', 'steel', 'professional', 'custom', 'logo',
  'for', 'with', 'and', 'the', 'a', 'an', 'of', 'in', 'on', 'mm',
])

function cleanText(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#36;/gi, '$')
    .replace(/\s+/g, ' ')
    .trim()
}

function attr(tag: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'))
  return match?.[2]?.trim() || null
}

export function alibabaProductIdFromUrl(url: URL | string) {
  const raw = typeof url === 'string' ? url : url.toString()
  const match = raw.match(/[_-](\d{8,})(?:\.html?|[/?#]|$)/i)
    || raw.match(/[?&](?:product_?id|id)=(\d{8,})(?:&|$)/i)
  return match?.[1] || null
}

function priceRange(text: string) {
  const range = text.match(/(?:US\s*\$|USD\s*|\$)\s*([\d,.]+)\s*(?:-|–|—|to)\s*(?:US\s*\$|USD\s*|\$)?\s*([\d,.]+)/i)
  if (range) {
    const values = [Number(range[1].replace(/,/g, '')), Number(range[2].replace(/,/g, ''))]
    if (values.every((value) => Number.isFinite(value) && value > 0)) {
      return { min: Math.min(...values), max: Math.max(...values) }
    }
  }

  const single = text.match(/(?:US\s*\$|USD\s*|\$)\s*([\d,.]+)/i)
  if (!single) return null
  const value = Number(single[1].replace(/,/g, ''))
  return Number.isFinite(value) && value > 0 ? { min: value, max: value } : null
}

function moqFromText(text: string) {
  const match = text.match(/\bMOQ\s*:?\s*([\d,]+)\b/i)
    || text.match(/\bmin(?:imum)?\.?\s*(?:order|order quantity)\s*:?\s*([\d,]+)\b/i)
  if (!match) return null
  const value = Number(match[1].replace(/,/g, ''))
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

function supplierFromText(text: string) {
  const company = text.match(/\b([A-Z][A-Za-z0-9&'() .,-]{4,160}?(?:Co\.?\s*,?\s*Ltd\.?|Company Limited|Limited|Trading Co\.?|Trade Co\.?\s*,?\s*Ltd\.?))\b/)
  return company ? company[1].replace(/\s+/g, ' ').trim().slice(0, 220) : null
}

function headingFromHtml(html: string) {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
  const heading = match ? cleanText(match[1]) : ''
  return heading && heading.length <= 180 ? heading : null
}

type ProductAnchor = {
  index: number
  end: number
  id: string
  url: string
  tag: string
  body: string
}

function productAnchors(html: string) {
  const anchors: ProductAnchor[] = []
  const pattern = /<a\b([^>]*?)\bhref\s*=\s*(["'])([\s\S]*?)\2([^>]*)>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(pattern)) {
    if (match.index === undefined) continue
    const url = canonicalAlibabaProductUrl(match[3])
    if (!url) continue
    const id = alibabaProductIdFromUrl(url)
    if (!id) continue
    const tag = `<a${match[1]} href=${match[2]}${match[3]}${match[2]}${match[4]}>`
    anchors.push({ index: match.index, end: match.index + match[0].length, id, url, tag, body: match[5] })
  }
  return anchors
}

/**
 * Extract commerce facts only from the card whose Alibaba product id exactly
 * matches the requested detail URL. Neighbouring cards are excluded by cutting
 * the segment at the next different product id. This is corroboration only:
 * it never supplies weight, volume or merchandise origin.
 */
export function extractExactAlibabaPublicListingFacts(html: string, target: URL | string, sourceUrl = 'https://www.alibaba.com/') {
  const targetId = alibabaProductIdFromUrl(target)
  if (!targetId || !html || BOT_PATTERNS.some((pattern) => pattern.test(html))) return null

  const anchors = productAnchors(html)
  const targetIndexes = anchors.map((anchor, index) => ({ anchor, index })).filter(({ anchor }) => anchor.id === targetId)
  if (!targetIndexes.length) return null

  const first = targetIndexes[0]
  const last = targetIndexes[targetIndexes.length - 1]
  const nextDifferent = anchors.slice(last.index + 1).find((anchor) => anchor.id !== targetId)
  const segmentStart = Math.max(0, first.anchor.index - 240)
  const segmentEnd = Math.min(html.length, nextDifferent?.index ?? (last.anchor.end + 2600))
  const segment = html.slice(segmentStart, segmentEnd)
  const text = cleanText(segment)

  const observedTitle = cleanText(attr(first.anchor.tag, 'title') || attr(first.anchor.tag, 'aria-label') || first.anchor.body)
  const fallbackTitle = titleFromAlibabaProductUrl(first.anchor.url)
  const name = observedTitle && observedTitle.length >= 8 && observedTitle.length <= 700 ? observedTitle : fallbackTitle
  const range = priceRange(text)
  const moq = moqFromText(text)
  const category = headingFromHtml(html)
  const supplier = supplierFromText(text)
  const evidence = [
    name ? 'exact_product_id_title' : null,
    range ? 'exact_product_id_price' : null,
    moq ? 'exact_product_id_moq' : null,
    category ? 'listing_page_category' : null,
    supplier ? 'exact_product_id_supplier' : null,
  ].filter((item): item is string => Boolean(item))

  if (!name && !range && !moq && !category) return null
  return {
    name: name || null,
    category,
    // Alibaba range cards normally display the MOQ-tier price at the high end.
    // Use the high end only as a conservative prefill; the user still confirms
    // the mandatory ficha before classification/economics.
    unitPriceUsd: range?.max ?? null,
    priceRangeUsd: range,
    moq,
    supplier,
    productId: targetId,
    sourceUrl,
    evidence,
  } satisfies AlibabaPublicCorroborationFacts
}

function compactQuery(title: string) {
  const tokens = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token && !/^\d+(?:mm|cm|m)?$/.test(token) && !QUERY_NOISE.has(token))
  if (tokens.length <= 3) return tokens.join(' ')
  return tokens.slice(0, 4).join(' ')
}

export function publicCorroborationQueries(target: URL, hints: { name?: string | null; category?: string | null } = {}) {
  const urlTitle = titleFromAlibabaProductUrl(target) || ''
  const name = (hints.name || '').trim()
  const category = (hints.category || '').trim()
  const candidates = [
    category && !/^sin clasificar$/i.test(category) ? category : '',
    compactQuery(name || urlTitle),
    name || urlTitle,
  ].filter(Boolean)
  return Array.from(new Set(candidates.map((value) => value.replace(/\s+/g, ' ').trim()).filter((value) => value.length >= 3))).slice(0, 3)
}

function wholesaleUrls(query: string) {
  const slug = query
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
  return slug ? [`https://www.alibaba.com/wholesale/${encodeURIComponent(slug)}.html`] : []
}

export function publicCorroborationUrls(target: URL, hints: { name?: string | null; category?: string | null } = {}) {
  const urls: string[] = []
  for (const query of publicCorroborationQueries(target, hints)) {
    urls.push(buildAlibabaSearchUrl(query))
    urls.push(...buildAlibabaSeoSearchUrls(query))
    urls.push(...wholesaleUrls(query))
  }
  return Array.from(new Set(urls)).slice(0, 10)
}

async function fetchPage(url: string, fetchImpl: FetchLike) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4500)
  try {
    const response = await fetchImpl(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ShippingAPP/3.0; +https://shippingapp.marciofabrizio.workers.dev)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    return { status: response.status, html: response.ok ? await response.text() : '' }
  } catch {
    return { status: null, html: '' }
  } finally {
    clearTimeout(timeout)
  }
}

export async function corroborateAlibabaPublicListing(
  target: URL,
  hints: { name?: string | null; category?: string | null } = {},
  fetchImpl: FetchLike = fetch,
): Promise<AlibabaPublicCorroborationResult> {
  const productId = alibabaProductIdFromUrl(target)
  if (!productId) {
    return { status: 'unavailable', source: 'Alibaba public listing corroboration', facts: null, pagesAttempted: 0, warnings: ['Alibaba product_id could not be resolved; public corroboration was skipped.'] }
  }

  const urls = publicCorroborationUrls(target, hints)
  const attempts = await Promise.all(urls.map(async (url) => ({ url, ...(await fetchPage(url, fetchImpl)) })))
  let best: AlibabaPublicCorroborationFacts | null = null
  let bestScore = -1
  for (const attempt of attempts) {
    if (!attempt.html) continue
    const facts = extractExactAlibabaPublicListingFacts(attempt.html, target, attempt.url)
    if (!facts) continue
    const score = facts.evidence.length + (facts.unitPriceUsd ? 2 : 0) + (facts.moq ? 2 : 0)
    if (score > bestScore) {
      best = facts
      bestScore = score
    }
  }

  if (!best) {
    const statuses = attempts.map((attempt) => attempt.status).filter((status): status is number => typeof status === 'number')
    return {
      status: 'unavailable',
      source: 'Alibaba public listing corroboration',
      facts: null,
      pagesAttempted: attempts.length,
      warnings: [`Alibaba public listing corroboration did not find exact product_id ${productId} across ${attempts.length} public page(s)${statuses.length ? `; HTTP statuses: ${Array.from(new Set(statuses)).join(', ')}` : ''}.`],
    }
  }

  return {
    status: 'ready',
    source: 'Alibaba public listing corroboration',
    facts: best,
    pagesAttempted: attempts.length,
    warnings: [
      `Matched exact Alibaba product_id ${productId} on a public listing surface.`,
      best.priceRangeUsd && best.priceRangeUsd.min !== best.priceRangeUsd.max
        ? `Alibaba public card showed USD ${best.priceRangeUsd.min}-${best.priceRangeUsd.max}; ShippingAPP prefills the conservative high end and still requires user confirmation.`
        : 'Public listing facts remain confirmation inputs, not autonomous supplier truth.',
    ],
  }
}
