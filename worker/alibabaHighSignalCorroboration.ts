import { extractExactAlibabaPublicListingFacts, type AlibabaPublicCorroborationResult } from './alibabaPublicCorroboration'
import { titleFromAlibabaProductUrl } from './productDiscovery'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const NOISE = new Set([
  'fully', 'automatic', 'mechanical', 'electric', 'electronic', 'digital', 'analog', 'analogue',
  'green', 'blue', 'black', 'white', 'red', 'silver', 'gold', 'dial', 'waterproof', 'water', 'resistant',
  'stainless', 'steel', 'plastic', 'metal', 'professional', 'portable', 'smart', 'wireless', 'bluetooth',
  'custom', 'logo', 'factory', 'wholesale', 'high', 'quality', 'new', 'hot', 'sale', 'men', 'mens', 'women', 'womens',
  'for', 'with', 'and', 'the', 'of', 'in', 'on', 'a', 'an',
])

const PRODUCT_NORMALIZATION: Record<string, string> = {
  wristwatch: 'watch', wristwatches: 'watch', watches: 'watch', watch: 'watch',
  headphones: 'headphones', headphone: 'headphones', earbuds: 'earbuds', earbud: 'earbuds',
  chargers: 'charger', charger: 'charger', adapters: 'adapter', adaptor: 'adapter', adapter: 'adapter',
  phones: 'phone', smartphone: 'phone', smartphones: 'phone',
  doorbells: 'doorbell', doorbell: 'doorbell', cameras: 'camera', camera: 'camera',
  panels: 'panel', panel: 'panel', bottles: 'bottle', bottle: 'bottle',
  rackets: 'racket', racquets: 'racket', racket: 'racket', racquet: 'racket',
  keyboards: 'keyboard', keyboard: 'keyboard', mice: 'mouse', mouse: 'mouse',
  speakers: 'speaker', speaker: 'speaker',
}

function normalizedTokens(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/(\d)\.(\d)(?=[a-z])/g, '$1$2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function productNoun(tokens: string[]) {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index]
    if (PRODUCT_NORMALIZATION[token]) return PRODUCT_NORMALIZATION[token]
  }
  const candidate = [...tokens].reverse().find((token) => /^[a-z]{4,}$/.test(token) && !NOISE.has(token))
  if (!candidate) return null
  return candidate.endsWith('s') && candidate.length > 5 ? candidate.slice(0, -1) : candidate
}

function discriminatorTokens(tokens: string[]) {
  return tokens.filter((token) =>
    /^\d+(?:w|v|a|ah|mah|wh|gb|tb|ml|l|kg|g|mm|cm|m|hz|mhz|ghz)$/.test(token)
    || /^\d+x\d+(?:x\d+)?$/.test(token),
  )
}

function rankDiscriminators(tokens: string[], noun: string) {
  const values = discriminatorTokens(tokens)
  if (noun !== 'watch') return values
  // For watches, water resistance such as 100m is a materially stronger Alibaba
  // SEO discriminator than case diameter such as 42.5mm. Keep dimensions as a
  // later fallback, never as the first public route.
  return values
    .map((value, index) => ({ value, index, priority: /^\d+m$/.test(value) ? 0 : /^\d+mm$/.test(value) ? 3 : 1 }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map((entry) => entry.value)
}

export function highSignalAlibabaPublicQueries(target: URL, hints: { name?: string | null; category?: string | null } = {}) {
  const title = (hints.name || titleFromAlibabaProductUrl(target) || '').trim()
  const tokens = normalizedTokens(title)
  const noun = productNoun(tokens)
  if (!noun) return []

  const queries: string[] = []
  for (const discriminator of rankDiscriminators(tokens, noun).slice(0, 3)) {
    queries.push(`${discriminator} ${noun}`)
  }
  if (/\bmechanical\b/i.test(title) && noun === 'watch') queries.push('mechanical watches')
  if (/\bautomatic\b/i.test(title) && noun === 'watch') queries.push('automatic watch')

  return Array.from(new Set(queries.map((value) => value.replace(/\s+/g, ' ').trim()))).slice(0, 5)
}

function slug(query: string) {
  return query
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function highSignalAlibabaPublicUrls(target: URL, hints: { name?: string | null; category?: string | null } = {}) {
  const urls: string[] = []
  for (const query of highSignalAlibabaPublicQueries(target, hints)) {
    const value = slug(query)
    if (!value) continue
    urls.push(`https://www.alibaba.com/countrysearch/CN/${value}.html`)
    urls.push(`https://www.alibaba.com/showroom/${value}.html`)
  }
  return Array.from(new Set(urls)).slice(0, 8)
}

async function fetchPage(url: string, fetchImpl: FetchLike) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4500)
  try {
    const response = await fetchImpl(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ShippingAPP/3.1; +https://shippingapp.marciofabrizio.workers.dev)',
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
    clearTimeout(timer)
  }
}

export async function corroborateAlibabaHighSignalRoutes(
  target: URL,
  hints: { name?: string | null; category?: string | null } = {},
  fetchImpl: FetchLike = fetch,
): Promise<AlibabaPublicCorroborationResult> {
  const urls = highSignalAlibabaPublicUrls(target, hints)
  if (!urls.length) {
    return {
      status: 'unavailable', source: 'Alibaba public listing corroboration', facts: null, pagesAttempted: 0,
      warnings: ['No high-signal Alibaba public routes could be derived from the product identity.'],
    }
  }

  const attempts = await Promise.all(urls.map(async (url) => ({ url, ...(await fetchPage(url, fetchImpl)) })))
  let best: ReturnType<typeof extractExactAlibabaPublicListingFacts> = null
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
    const statuses = attempts.map((attempt) => attempt.status).filter((value): value is number => typeof value === 'number')
    return {
      status: 'unavailable', source: 'Alibaba public listing corroboration', facts: null, pagesAttempted: attempts.length,
      warnings: [`High-signal Alibaba public routes did not expose the exact selected product_id across ${attempts.length} page(s)${statuses.length ? `; HTTP statuses: ${Array.from(new Set(statuses)).join(', ')}` : ''}.`],
    }
  }

  return {
    status: 'ready',
    source: 'Alibaba public listing corroboration',
    facts: best,
    pagesAttempted: attempts.length,
    warnings: [`High-signal public route matched exact product_id ${best.productId} at ${best.sourceUrl}.`],
  }
}
