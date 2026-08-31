import type { ArgentinaMarketCandidate, ArgentinaMarketDiscoveryProvider } from './marketProviderContracts'

export type GoogleShoppingMarketProviderOptions = {
  apiKey: string
  fetchImpl?: typeof fetch
  location?: string
}

type GoogleShoppingResult = {
  position?: number
  title?: string
  price?: string
  extracted_price?: number
  link?: string
  source?: string
  product_id?: string
  second_hand_condition?: string
  extensions?: string[]
}

type GoogleShoppingResponse = {
  shopping_results?: GoogleShoppingResult[]
  inline_shopping_results?: GoogleShoppingResult[]
  error?: string
  search_metadata?: { status?: string }
}

const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json'

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function isExplicitForeignCurrency(price: string | undefined) {
  const normalized = (price || '').toLowerCase().replace(/\s+/g, '')
  return normalized.includes('usd')
    || normalized.includes('us$')
    || normalized.includes('u$s')
    || normalized.includes('dolar')
    || normalized.includes('dólar')
}

export function extractMercadoLibreItemId(link: string | undefined): string | null {
  if (!link) return null
  let value = link
  try { value = decodeURIComponent(link) } catch { /* keep original */ }
  const match = value.match(/(?:^|[^A-Z0-9])MLA[-_]?([0-9]{6,})(?:[^0-9]|$)/i)
  return match ? `MLA${match[1]}` : null
}

function conditionOf(result: GoogleShoppingResult) {
  const text = [result.second_hand_condition, ...(result.extensions || [])].filter(Boolean).join(' ').toLowerCase()
  return /\b(usado|used|reacondicionado|refurbished)\b/.test(text) ? 'used' : 'new'
}

function stableCandidateId(result: GoogleShoppingResult, index: number) {
  const mlItemId = extractMercadoLibreItemId(result.link)
  if (mlItemId) return mlItemId
  if (result.product_id?.trim()) return `google-shopping:${result.product_id.trim()}`
  if (result.link?.trim()) return `google-shopping:${result.link.trim()}`
  return `google-shopping:position-${result.position ?? index + 1}`
}

function asCandidate(result: GoogleShoppingResult, index: number): ArgentinaMarketCandidate | null {
  const title = result.title?.trim()
  const priceArs = positiveNumber(result.extracted_price)
  if (!title || !priceArs || isExplicitForeignCurrency(result.price)) return null

  return {
    id: stableCandidateId(result, index),
    title,
    priceArs,
    condition: conditionOf(result),
    sellerKey: result.source?.trim() || undefined,
    permalink: result.link?.trim() || undefined,
  }
}

export function createGoogleShoppingArgentinaProvider(options: GoogleShoppingMarketProviderOptions): ArgentinaMarketDiscoveryProvider {
  const apiKey = options.apiKey.trim()
  if (!apiKey) throw new Error('SERPAPI_API_KEY is required for Google Shopping Argentina discovery')
  const fetchImpl = options.fetchImpl || fetch
  const location = options.location?.trim() || 'Buenos Aires, Buenos Aires, Argentina'

  return {
    id: 'google-shopping-argentina',
    async discover(context) {
      const params = new URLSearchParams({
        engine: 'google_shopping',
        q: context.query,
        gl: 'ar',
        hl: 'es',
        google_domain: 'google.com.ar',
        location,
        api_key: apiKey,
      })
      const response = await fetchImpl(`${SERPAPI_ENDPOINT}?${params.toString()}`, {
        headers: {
          accept: 'application/json',
          'user-agent': 'ShippingAPP/2.0',
        },
      })
      if (!response.ok) throw new Error(`Google Shopping discovery HTTP ${response.status}`)

      const data = await response.json() as GoogleShoppingResponse
      if (data.error) throw new Error(`Google Shopping discovery unavailable: ${data.error.slice(0, 180)}`)

      const shopping = Array.isArray(data.shopping_results) ? data.shopping_results : []
      const inline = Array.isArray(data.inline_shopping_results) ? data.inline_shopping_results : []
      const raw = [...shopping, ...inline]
      const candidates = raw.flatMap((result, index) => {
        const candidate = asCandidate(result, index)
        return candidate ? [candidate] : []
      })
      const rejectedCurrency = raw.filter((result) => isExplicitForeignCurrency(result.price)).length

      return {
        providerId: 'google-shopping-argentina',
        sourceLabel: 'Google Shopping Argentina via SerpApi',
        candidates,
        categoryHint: null,
        warnings: [
          'Google Shopping discovery is localized with gl=ar, hl=es and google.com.ar; prices explicitly labelled USD/dólar are rejected.',
          'Google Shopping does not expose a currency_id field in each shopping result; localized extracted_price is treated as ARS only after explicit foreign-currency rejection.',
          ...(rejectedCurrency ? [`${rejectedCurrency} shopping result(s) rejected because the displayed price explicitly indicated a foreign currency.`] : []),
        ],
      }
    },
  }
}
