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

export function buildAlibabaSearchUrl(query: string) {
  const normalized = query.trim().replace(/\s+/g, ' ').slice(0, 220)
  if (!normalized) throw new Error('missing_query')
  const url = new URL('https://www.alibaba.com/trade/search')
  url.searchParams.set('fsb', 'y')
  url.searchParams.set('IndexArea', 'product_en')
  url.searchParams.set('CatId', '')
  url.searchParams.set('SearchText', normalized)
  return url.toString()
}

export function canonicalAlibabaProductUrl(rawHref: string, base = 'https://www.alibaba.com') {
  try {
    const url = new URL(rawHref.trim(), base)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== 'https:') return null
    if (!(host === 'alibaba.com' || host.endsWith('.alibaba.com'))) return null
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
  try {
    const response = await fetchImpl(searchUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ShippingAPP/1.6; +https://shippingapp.workers.dev)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.8',
      },
      redirect: 'follow',
    })
    const html = response.ok ? await response.text() : ''
    return { status: response.status, results: extractAlibabaProductLinks(html) }
  } catch {
    return { status: null, results: [] as DiscoveryResult[] }
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
  const normalizedQuery = new URL(searchUrl).searchParams.get('SearchText') || query.trim()
  const direct = await directSearch(searchUrl, fetchImpl)

  // A direct search with several real product URLs is sufficient and avoids
  // spending Browser Run time. Search pages with 1-2 links are treated as
  // incomplete because navigation/footer links can create false confidence.
  if (direct.results.length >= 3) {
    return {
      status: 'live', mode: 'direct', query: normalizedQuery,
      results: direct.results, browserAttempted: false, browserMsUsed: null,
      note: `${direct.results.length} productos Alibaba con URL fuente real extraídos por lectura directa.`,
    }
  }

  const rendered = await browserSearch(searchUrl, browser)
  if (rendered.results.length > 0) {
    return {
      status: 'live', mode: 'browser', query: normalizedQuery,
      results: rendered.results, browserAttempted: true, browserMsUsed: rendered.ms,
      note: `${rendered.results.length} productos Alibaba con URL fuente real extraídos mediante Browser Run.`,
    }
  }

  return {
    status: 'unavailable', mode: 'unavailable', query: normalizedQuery,
    results: [], browserAttempted: true, browserMsUsed: rendered.ms,
    note: 'Alibaba no expuso resultados de producto verificables. ShippingAPP no genera una lista sintética.',
  }
}
