type ParsebotOpportunityEnv = {
  PARSEBOT_API_KEY?: string
  PARSEBOT_ENDPOINT_URL?: string
  PARSEBOT_SCRAPER_ID?: string
}

const DEFAULT_PARSEBOT_SCRAPER_ID = 'ba2822dd-f985-4faa-8d3b-81d795bda2a7'

export type OpportunitySearchItem = {
  title: string
  url: string
  productId: string | null
  imageUrl: string | null
  unitPriceUsd: number | null
  moq: number | null
  priceDisplay: string | null
  supplierName: string | null
  supplierYears: string | null
  supplierBadges: string[]
  reviewCount: number | null
  reviewScore: number | null
  packedWeightKg: number | null
  volumeCbm: number | null
  opportunityScore: number
  missingFacts: string[]
  sellingPoints: string[]
  nextAction: 'analyze_product' | 'needs_supplier_data'
  source: 'parsebot_search_products'
}

export type OpportunitySearchResponse = {
  status: 'live' | 'unavailable' | 'not_configured'
  mode: 'parsebot' | 'unavailable'
  query: string
  results: OpportunitySearchItem[]
  totalCount: number | null
  totalPages: number | null
  currentPage: number
  creditsEstimated: number
  note: string
  warnings: string[]
}

function cleanString(value: unknown, max = 500) {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized ? normalized.slice(0, max) : null
}

function firstPresent(root: any, keys: string[]) {
  for (const key of keys) {
    const parts = key.split('.')
    let value = root
    for (const part of parts) value = value?.[part]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return null
}

function numberOrNull(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null
  if (typeof value !== 'string') return null
  const match = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  const n = match ? Number(match[0]) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

function arrayStrings(value: unknown, max = 10) {
  return Array.isArray(value)
    ? value.map((item) => cleanString(item, 160)).filter(Boolean).slice(0, max) as string[]
    : []
}

function imageUrl(root: any) {
  const value = firstPresent(root, ['imageUrl', 'image_url', 'image_urls', 'images', 'main_image', 'thumbnail', 'thumbnail_url'])
  if (Array.isArray(value)) return cleanString(value.find((item) => typeof item === 'string'), 1000)
  return cleanString(value, 1000)
}

function normalizeAlibabaProductUrl(raw: string | null, productId: string | null) {
  const fallback = productId ? `https://www.alibaba.com/product-detail/_${encodeURIComponent(productId)}.html` : ''
  if (!raw) return fallback

  let candidate = raw.trim().replace(/\s+/g, '')
  if (!candidate) return fallback
  if (candidate.startsWith('//')) candidate = `https:${candidate}`
  else if (candidate.startsWith('/')) candidate = `https://www.alibaba.com${candidate}`
  else if (/^(?:www\.)?alibaba\.com\//i.test(candidate)) candidate = `https://${candidate}`

  try {
    const url = new URL(candidate)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return fallback
    if (host !== 'alibaba.com' && !host.endsWith('.alibaba.com')) return fallback
    url.protocol = 'https:'
    return url.toString()
  } catch {
    return fallback
  }
}

function productUrl(root: any, productId: string | null) {
  const explicit = cleanString(firstPresent(root, ['product_url', 'productUrl', 'url', 'link']), 1200)
  return normalizeAlibabaProductUrl(explicit, productId)
}

function priceFromTiers(root: any) {
  const tiers = firstPresent(root, ['price_tiers', 'priceTiers', 'tiers'])
  if (!Array.isArray(tiers)) return null
  const normalized = tiers
    .map((tier: any) => ({
      minQuantity: numberOrNull(tier?.min_quantity ?? tier?.minQuantity ?? tier?.min_qty ?? tier?.from),
      price: numberOrNull(tier?.price_value ?? tier?.priceValue ?? tier?.unit_price ?? tier?.unitPrice ?? tier?.price),
    }))
    .filter((tier) => tier.price)
    .sort((a, b) => (a.minQuantity ?? Number.MAX_SAFE_INTEGER) - (b.minQuantity ?? Number.MAX_SAFE_INTEGER))
  return normalized[0]?.price ?? null
}

function priceFromDisplay(value: unknown) {
  const text = cleanString(value, 200)
  if (!text) return null
  const numbers = text.match(/\d+(?:\.\d+)?/g)?.map(Number).filter((n) => Number.isFinite(n) && n > 0) || []
  return numbers[0] ?? null
}

function weightKg(value: unknown) {
  const text = cleanString(value, 120)
  const amount = numberOrNull(value)
  if (!amount) return null
  if (text && /\bg\b|grams?/i.test(text) && !/kg/i.test(text)) return Number((amount / 1000).toFixed(4))
  return amount
}

function dimensionsToCbm(value: unknown) {
  const text = cleanString(value, 200)
  if (!text) return null
  const dims = text.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) || []
  if (dims.length !== 3 || dims.some((n) => !Number.isFinite(n) || n <= 0)) return null
  const factor = /\bmm\b/i.test(text) ? 0.001 : /\bm\b|meters?|metres?/i.test(text) && !/\bcm\b/i.test(text) ? 1 : 0.01
  const cbm = dims.reduce((product, n) => product * n * factor, 1)
  return Number.isFinite(cbm) && cbm > 0 ? Number(cbm.toFixed(6)) : null
}

function searchEndpoint(env: ParsebotOpportunityEnv) {
  const endpointUrl = cleanString(env.PARSEBOT_ENDPOINT_URL, 1000)
  if (endpointUrl) return endpointUrl.replace(/\/get_product(?:\?.*)?$/i, '/search_products')
  const scraperId = cleanString(env.PARSEBOT_SCRAPER_ID, 200) || DEFAULT_PARSEBOT_SCRAPER_ID
  return `https://api.parse.bot/scraper/${encodeURIComponent(scraperId)}/search_products`
}

function productList(body: any) {
  const data = body?.data ?? body
  const candidates = [
    data?.products,
    data?.results,
    data?.items,
    data?.product_summaries,
    data?.summaries,
    data?.data?.products,
    data?.data?.results,
  ]
  for (const list of candidates) if (Array.isArray(list)) return list.filter((item) => item && typeof item === 'object')
  return Array.isArray(data) ? data.filter((item) => item && typeof item === 'object') : []
}

function scoreOpportunity(item: Omit<OpportunitySearchItem, 'opportunityScore' | 'nextAction'>) {
  let score = 30
  if (item.unitPriceUsd) score += 14
  if (item.moq) score += item.moq <= 10 ? 14 : item.moq <= 100 ? 8 : 3
  if (item.imageUrl) score += 8
  if (item.supplierName) score += 8
  if (item.supplierBadges.some((badge) => /verified|trade assurance|gold/i.test(badge))) score += 12
  if ((item.reviewCount ?? 0) > 0) score += 5
  if (item.packedWeightKg) score += 4
  if (item.volumeCbm) score += 5
  return Math.max(0, Math.min(100, score))
}

function normalizeItem(raw: any): OpportunitySearchItem | null {
  const productId = cleanString(firstPresent(raw, ['product_id', 'productId', 'id', 'item_id', 'offer_id']), 80)
  const title = cleanString(firstPresent(raw, ['title', 'name', 'product_name', 'productName']), 700)
  const url = productUrl(raw, productId)
  if (!title || !url) return null

  const shipping = raw.shipping_info && typeof raw.shipping_info === 'object'
    ? raw.shipping_info
    : raw.shippingInfo && typeof raw.shippingInfo === 'object'
      ? raw.shippingInfo
      : {}
  const priceDisplay = cleanString(firstPresent(raw, ['price_display', 'priceDisplay', 'display_price', 'price']), 120)
  const price = priceFromTiers(raw) ?? numberOrNull(firstPresent(raw, ['price_value', 'priceValue', 'unit_price', 'unitPrice'])) ?? priceFromDisplay(priceDisplay)
  const moq = numberOrNull(firstPresent(raw, ['moq', 'minimum_order_quantity', 'minimumOrderQuantity', 'min_order', 'minOrder']))
  const weight = weightKg(firstPresent(raw, ['packedWeightKg', 'packed_weight_kg', 'shipping_info.unit_weight', 'shippingInfo.unitWeight']) ?? firstPresent(shipping, ['unit_weight', 'unitWeight', 'weight']))
  const volume = numberOrNull(firstPresent(raw, ['volumeCbm', 'volume_cbm'])) ?? dimensionsToCbm(firstPresent(raw, ['shipping_info.unit_size', 'shippingInfo.unitSize']) ?? firstPresent(shipping, ['unit_size', 'unitSize', 'dimensions']))
  const badges = arrayStrings(firstPresent(raw, ['supplier_badges', 'supplierBadges', 'badges']))
  const missingFacts = [
    price ? null : 'supplier_price',
    moq ? null : 'moq',
    weight ? null : 'package_weight',
    volume ? null : 'package_volume',
  ].filter(Boolean) as string[]
  const sellingPoints = [
    ...badges.slice(0, 3),
    moq && moq <= 10 ? 'low MOQ' : null,
    price ? `USD ${price}` : null,
  ].filter(Boolean) as string[]

  const base = {
    title,
    url,
    productId,
    imageUrl: imageUrl(raw),
    unitPriceUsd: price,
    moq,
    priceDisplay,
    supplierName: cleanString(firstPresent(raw, ['supplier_name', 'supplierName', 'supplier.name', 'company', 'company_name']), 300),
    supplierYears: cleanString(firstPresent(raw, ['supplier_years', 'supplierYears', 'years_on_platform']), 80),
    supplierBadges: badges,
    reviewCount: numberOrNull(firstPresent(raw, ['review_count', 'reviewCount', 'reviews_count'])),
    reviewScore: numberOrNull(firstPresent(raw, ['review_score', 'reviewScore', 'rating'])),
    packedWeightKg: weight,
    volumeCbm: volume,
    missingFacts,
    sellingPoints,
    source: 'parsebot_search_products' as const,
  }
  const opportunityScore = scoreOpportunity(base)
  return {
    ...base,
    opportunityScore,
    nextAction: missingFacts.length > 0 ? 'analyze_product' : 'analyze_product',
  }
}

async function callSearch(endpoint: string, apiKey: string, query: string, page: number, sort: string) {
  const target = new URL(endpoint)
  target.searchParams.set('query', query)
  target.searchParams.set('page', String(page))
  if (sort) target.searchParams.set('sort', sort)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 9000)
  try {
    const response = await fetch(target.toString(), {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'x-api-key': apiKey,
        'user-agent': 'ShippingAPP/2.6 ParsebotOpportunityFinder',
      },
      signal: controller.signal,
    })
    const text = await response.text()
    let body: any = null
    try { body = text ? JSON.parse(text) : null } catch { body = { raw_output: text } }
    return { response, body }
  } finally {
    clearTimeout(timeout)
  }
}

export async function searchAlibabaOpportunities(query: string, env: ParsebotOpportunityEnv, options: { page?: number; sort?: string; limit?: number } = {}): Promise<OpportunitySearchResponse> {
  const normalizedQuery = query.trim().replace(/\s+/g, ' ').slice(0, 220)
  const page = Math.max(1, Math.min(5, Math.trunc(options.page || 1)))
  const limit = Math.max(1, Math.min(24, Math.trunc(options.limit || 12)))
  const sort = (options.sort || 'best_match').trim().slice(0, 50)
  if (!normalizedQuery) {
    return { status: 'unavailable', mode: 'unavailable', query: '', results: [], totalCount: null, totalPages: null, currentPage: page, creditsEstimated: 0, note: 'Query vacía.', warnings: ['Ingresá un producto o categoría para buscar.'] }
  }
  if (!env.PARSEBOT_API_KEY) {
    return { status: 'not_configured', mode: 'unavailable', query: normalizedQuery, results: [], totalCount: null, totalPages: null, currentPage: page, creditsEstimated: 0, note: 'Parse.bot no está configurado.', warnings: ['Falta PARSEBOT_API_KEY.'] }
  }

  try {
    const result = await callSearch(searchEndpoint(env), env.PARSEBOT_API_KEY, normalizedQuery, page, sort)
    if (!result.response.ok || result.body?.status === 'error' || result.body?.status === 'timeout') {
      return {
        status: 'unavailable',
        mode: 'unavailable',
        query: normalizedQuery,
        results: [],
        totalCount: null,
        totalPages: null,
        currentPage: page,
        creditsEstimated: 2,
        note: 'Parse.bot search_products no devolvió resultados utilizables.',
        warnings: [`search_products returned ${result.body?.status || `HTTP ${result.response.status}`}`],
      }
    }

    const data = result.body?.data ?? result.body
    const results = productList(result.body)
      .map(normalizeItem)
      .filter(Boolean) as OpportunitySearchItem[]
    results.sort((a, b) => b.opportunityScore - a.opportunityScore)
    return {
      status: 'live',
      mode: 'parsebot',
      query: normalizedQuery,
      results: results.slice(0, limit),
      totalCount: numberOrNull(firstPresent(data, ['total_count', 'totalCount'])) ?? results.length,
      totalPages: numberOrNull(firstPresent(data, ['total_pages', 'totalPages'])),
      currentPage: numberOrNull(firstPresent(data, ['current_page', 'currentPage'])) ?? page,
      creditsEstimated: 2,
      note: `Parse.bot search_products devolvió ${results.length} candidatos; se muestran los mejores ${Math.min(limit, results.length)} por datos disponibles, proveedor y MOQ.`,
      warnings: results.length ? [] : ['Parse.bot respondió, pero no encontramos productos normalizables.'],
    }
  } catch (error) {
    return {
      status: 'unavailable',
      mode: 'unavailable',
      query: normalizedQuery,
      results: [],
      totalCount: null,
      totalPages: null,
      currentPage: page,
      creditsEstimated: 2,
      note: 'No pudimos consultar search_products.',
      warnings: [error instanceof Error ? error.message : 'Parse.bot search failed'],
    }
  }
}
