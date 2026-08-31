import type { BrowserRun } from './alibabaSource'

export type DiscoveryMode = 'direct' | 'browser' | 'unavailable'

export type DiscoveryResult = {
  title: string
  url: string
  evidence: 'live'
}

export type DiscoveryResponse = {
  status: 'live' | 'unavailable'
  mode: DiscoveryMode
  query: string
  results: DiscoveryResult[]
  browserAttempted: boolean
  browserMsUsed: number | null
  note: string
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const BOT_PATTERNS = [
  /captcha/i,
  /verify (?:that )?you are human/i,
  /unusual traffic/i,
  /access denied/i,
  /robot check/i,
  /security verification/i,
]

const CARD_COMMERCE_PATTERNS = [
  /(?:US\s*\$|USD\s*|\$)\s*\d/i,
  /\bMOQ\b/i,
  /min(?:imum)?\.?\s*(?:order|order quantity)/i,
  /\b\d[\d,.]*\s+sold\b/i,
]

const SEO_NOISE_TOKENS = new Set([
  'best', 'cheap', 'factory', 'high', 'latest', 'new', 'oem', 'odm', 'price', 'quality',
  'smart', 'supplier', 'suppliers', 'wholesale', 'wifi', 'with', 'for', 'and', 'the',
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
    .replace(/\s+/g, ' ')
    .trim()
}

function attr(tag: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'))
  return match?.[2]?.trim() || null
}

function normalizedQuery(query: string) {
  return query.trim().replace(/\s+/g, ' ').slice(0, 220)
}

function slugTokens(query: string) {
  return normalizedQuery(query)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function slugFrom(tokens: string[]) {
  return tokens.join('-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 140)
}

export function buildAlibabaSearchUrl(query: string) {
  const normalized = normalizedQuery(query)
  if (!normalized) throw new Error('missing_query')
  const url = new URL('https://www.alibaba.com/trade/search')
  url.searchParams.set('fsb', 'y')
  url.searchParams.set('IndexArea', 'product_en')
  url.searchParams.set('CatId', '')
  url.searchParams.set('SearchText', normalized)
  return url.toString()
}

/**
 * Alibaba exposes public, search-engine-facing category/showroom pages that are
 * materially more cacheable than /trade/search. They are used only as a free,
 * read-only discovery fallback; every returned item still needs a real Alibaba
 * product-detail URL before ShippingAPP treats it as evidence.
 */
export function buildAlibabaSeoSearchUrls(query: string) {
  const tokens = slugTokens(query)
  if (!tokens.length) return []

  const full = slugFrom(tokens)
  const reducedTokens = tokens.filter((token) => !SEO_NOISE_TOKENS.has(token))
  const reduced = reducedTokens.length >= 2 ? slugFrom(reducedTokens) : ''
  const tail = tokens.length >= 4 ? slugFrom(tokens.slice(-3)) : ''
  const slugs = Array.from(new Set([full, reduced, tail].filter(Boolean)))

  const urls: string[] = []
  for (const slug of slugs) {
    urls.push(`https://www.alibaba.com/showroom/${encodeURIComponent(slug)}.html`)
    urls.push(`https://www.alibaba.com/countrysearch/CN/${encodeURIComponent(slug)}.html`)
  }
  return urls.slice(0, 4)
}

export function canonicalAlibabaProductUrl(rawHref: string, base = 'https://www.alibaba.com') {
  try {
    const url = new URL(rawHref.trim(), base)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== 'https:') return null
    if (!['alibaba.com', 'www.alibaba.com', 'm.alibaba.com'].includes(host)) return null
    if (!/^\/product-detail\//i.test(url.pathname)) return null
    if (!/\.html?$/i.test(url.pathname)) return null
    url.protocol = 'https:'
    url.hostname = 'www.alibaba.com'
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

export function extractAlibabaProductLinks(html: string, maxResults = 8): DiscoveryResult[] {
  if (!html || BOT_PATTERNS.some((pattern) => pattern.test(html))) return []
  const results: DiscoveryResult[] = []
  const seen = new Set<string>()
  const anchorPattern = /<a\b[^>]*\bhref\s*=\s*(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/gi

  for (const match of html.matchAll(anchorPattern)) {
    const tag = match[0].slice(0, match[0].indexOf('>') + 1)
    const href = match[2]
    const url = canonicalAlibabaProductUrl(href)
    if (!url || seen.has(url)) continue

    const titleAttr = attr(tag, 'title') || attr(tag, 'aria-label')
    const bodyText = cleanText(match[3])
    if (!titleAttr && CARD_COMMERCE_PATTERNS.some((pattern) => pattern.test(bodyText))) continue
    const title = cleanText(titleAttr || bodyText).slice(0, 300)
    if (title.length < 8) continue

    seen.add(url)
    results.push({ title, url, evidence: 'live' })
    if (results.length >= Math.max(1, Math.min(12, maxResults))) break
  }
  return results
}

function browserMs(response: Response) {
  const value = Number(response.headers.get('X-Browser-Ms-Used'))
  return Number.isFinite(value) && value >= 0 ? value : null
}

async function directSearch(searchUrl: string, fetchImpl: FetchLike) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4500)
  try {
    const response = await fetchImpl(searchUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ShippingAPP/2.8; +https://shippingapp.workers.dev)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    const html = response.ok ? await response.text() : ''
    return { status: response.status, results: extractAlibabaProductLinks(html) }
  } catch {
    return { status: null, results: [] as DiscoveryResult[] }
  } finally {
    clearTimeout(timeout)
  }
}

function mergeDiscoveryResults(groups: DiscoveryResult[][], maxResults = 8) {
  const merged: DiscoveryResult[] = []
  const seen = new Set<string>()
  for (const group of groups) {
    for (const item of group) {
      if (seen.has(item.url)) continue
      seen.add(item.url)
      merged.push(item)
      if (merged.length >= maxResults) return merged
    }
  }
  return merged
}

async function freeSeoSearch(query: string, fetchImpl: FetchLike) {
  const urls = buildAlibabaSeoSearchUrls(query)
  if (!urls.length) return { results: [] as DiscoveryResult[], attempted: 0 }
  const attempts = await Promise.all(urls.map((url) => directSearch(url, fetchImpl)))
  return {
    results: mergeDiscoveryResults(attempts.map((attempt) => attempt.results), 8),
    attempted: attempts.length,
  }
}

async function browserSearch(searchUrl: string, browser: BrowserRun) {
  try {
    const response = await browser.quickAction('content', {
      url: searchUrl,
      gotoOptions: { waitUntil: 'networkidle2', timeout: 20000 },
      rejectResourceTypes: ['image', 'media', 'font'],
    })
    const ms = browserMs(response)
    if (!response.ok) return { results: [] as DiscoveryResult[], ms }
    return { results: extractAlibabaProductLinks(await response.text()), ms }
  } catch {
    return { results: [] as DiscoveryResult[], ms: null }
  }
}

export async function discoverAlibabaProducts(
  query: string,
  browser: BrowserRun,
  fetchImpl: FetchLike = fetch,
): Promise<DiscoveryResponse> {
  const searchUrl = buildAlibabaSearchUrl(query)
  const normalized = new URL(searchUrl).searchParams.get('SearchText') || query.trim()
  const direct = await directSearch(searchUrl, fetchImpl)

  // A direct search with several real product URLs is sufficient and avoids
  // spending Browser Run time. Search pages with 1-2 links are treated as
  // incomplete because navigation/footer links can create false confidence.
  if (direct.results.length >= 3) {
    return {
      status: 'live', mode: 'direct', query: normalized,
      results: direct.results, browserAttempted: false, browserMsUsed: null,
      note: `${direct.results.length} productos Alibaba con URL fuente real extraídos por lectura directa.`,
    }
  }

  // Parse.bot's structured search is optional and may return HTTP 402 when its
  // credit pool is exhausted. Before spending Browser Run time, use Alibaba's
  // own public SEO/showroom surfaces. No third-party key, login or synthetic
  // product data is involved.
  const seo = await freeSeoSearch(normalized, fetchImpl)
  const freeDirectResults = mergeDiscoveryResults([direct.results, seo.results], 8)
  if (freeDirectResults.length >= 3) {
    return {
      status: 'live', mode: 'direct', query: normalized,
      results: freeDirectResults, browserAttempted: false, browserMsUsed: null,
      note: `${freeDirectResults.length} productos Alibaba con URL fuente real extraídos mediante búsqueda pública directa/SEO.`,
    }
  }

  const rendered = await browserSearch(searchUrl, browser)
  const renderedResults = mergeDiscoveryResults([freeDirectResults, rendered.results], 8)
  if (renderedResults.length > 0) {
    return {
      status: 'live', mode: 'browser', query: normalized,
      results: renderedResults, browserAttempted: true, browserMsUsed: rendered.ms,
      note: `${renderedResults.length} productos Alibaba con URL fuente real extraídos mediante fuentes públicas y Browser Run.`,
    }
  }

  return {
    status: 'unavailable', mode: 'unavailable', query: normalized,
    results: [], browserAttempted: true, browserMsUsed: rendered.ms,
    note: `Alibaba no expuso resultados de producto verificables después de trade search, ${seo.attempted} superficies SEO públicas y Browser Run. ShippingAPP no genera una lista sintética.`,
  }
}
