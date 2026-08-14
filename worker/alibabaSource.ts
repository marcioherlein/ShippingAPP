export type BrowserRun = {
  quickAction: (action: string, input: unknown) => Promise<Response>
}

export type AlibabaReadMode = 'direct' | 'browser' | 'partial' | 'blocked'

export type AlibabaSourceRead = {
  html: string
  mode: AlibabaReadMode
  quality: number
  directStatus: number | null
  browserAttempted: boolean
  browserMsUsed: number | null
  reason: string
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

function metaValue(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return null
}

export function alibabaHtmlQuality(html: string) {
  if (!html || html.length < 500) return 0
  const botPage = BOT_PATTERNS.some((pattern) => pattern.test(html))
  const jsonLdProduct = /application\/ld\+json/i.test(html) && /["']@type["']\s*:\s*["']Product["']/i.test(html)
  const ogTitle = metaValue(html, 'og:title') || metaValue(html, 'twitter:title')
  const productTitle = !!ogTitle && !/^alibaba(?:\.com)?\s*[-|:]?\s*(?:global|manufacturer|supplier)?/i.test(ogTitle)
  const priceSignal = /(?:US\s*\$|USD\s*|\$)\s*\d{1,6}(?:\.\d{1,4})?/i.test(html)
  const moqSignal = /(?:\bMOQ\b|min(?:imum)?\.?\s*(?:order|order quantity)|\d+\s*(?:pieces|pcs|units|sets)\s*min)/i.test(html)
  const productDetailSignal = /product-detail/i.test(html) && /(?:product|supplier|price|order)/i.test(html)

  let score = 0
  if (jsonLdProduct) score += 3
  if (productTitle) score += 2
  if (priceSignal) score += 2
  if (moqSignal) score += 2
  if (productDetailSignal) score += 1

  // A bot/challenge page can contain generic product words in scripts/footers.
  // Require hard product evidence before treating it as readable.
  if (botPage && !jsonLdProduct && !(productTitle && (priceSignal || moqSignal))) return 0
  return score
}

function browserMs(response: Response) {
  const value = Number(response.headers.get('X-Browser-Ms-Used'))
  return Number.isFinite(value) && value >= 0 ? value : null
}

async function directRead(url: URL, fetchImpl: FetchLike) {
  try {
    const response = await fetchImpl(url.toString(), {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ShippingAPP/1.4; +https://shippingapp.workers.dev)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.8',
      },
      redirect: 'follow',
    })
    const html = response.ok ? await response.text() : ''
    return { html, status: response.status, quality: alibabaHtmlQuality(html) }
  } catch {
    return { html: '', status: null, quality: 0 }
  }
}

async function browserRead(url: URL, browser: BrowserRun) {
  try {
    const response = await browser.quickAction('content', {
      url: url.toString(),
      gotoOptions: { waitUntil: 'networkidle2', timeout: 20000 },
      rejectResourceTypes: ['image', 'media', 'font'],
    })
    if (!response.ok) return { html: '', quality: 0, ms: browserMs(response) }
    const html = await response.text()
    return { html, quality: alibabaHtmlQuality(html), ms: browserMs(response) }
  } catch {
    return { html: '', quality: 0, ms: null }
  }
}

export async function readAlibabaSource(
  url: URL,
  browser: BrowserRun,
  fetchImpl: FetchLike = fetch,
): Promise<AlibabaSourceRead> {
  const direct = await directRead(url, fetchImpl)

  // Two or more independent signals are sufficient to avoid spending browser
  // time. Browser Run is reserved for economically incomplete reads.
  if (direct.quality >= 4) {
    return {
      html: direct.html,
      mode: 'direct',
      quality: direct.quality,
      directStatus: direct.status,
      browserAttempted: false,
      browserMsUsed: null,
      reason: 'El fetch directo expuso suficientes señales de producto; Browser Run no fue necesario.',
    }
  }

  const rendered = await browserRead(url, browser)
  if (rendered.quality > direct.quality && rendered.quality > 0) {
    return {
      html: rendered.html,
      mode: 'browser',
      quality: rendered.quality,
      directStatus: direct.status,
      browserAttempted: true,
      browserMsUsed: rendered.ms,
      reason: 'El fetch directo fue insuficiente y Browser Run produjo una lectura de mayor calidad.',
    }
  }

  if (direct.quality > 0) {
    return {
      html: direct.html,
      mode: 'partial',
      quality: direct.quality,
      directStatus: direct.status,
      browserAttempted: true,
      browserMsUsed: rendered.ms,
      reason: 'Alibaba sólo expuso una lectura parcial; Browser Run no mejoró la evidencia disponible.',
    }
  }

  return {
    html: '',
    mode: 'blocked',
    quality: 0,
    directStatus: direct.status,
    browserAttempted: true,
    browserMsUsed: rendered.ms,
    reason: 'Ni el fetch directo ni Browser Run expusieron evidencia de producto utilizable.',
  }
}
