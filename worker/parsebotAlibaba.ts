type ParsebotEnv = {
  PARSEBOT_API_KEY?: string
  PARSEBOT_ENDPOINT_URL?: string
  PARSEBOT_SCRAPER_ID?: string
  PARSEBOT_ENDPOINT_NAME?: string
}

const DEFAULT_PARSEBOT_SCRAPER_ID = 'ba2822dd-f985-4faa-8d3b-81d795bda2a7'
const DEFAULT_PARSEBOT_ALIBABA_ENDPOINT = `https://api.parse.bot/scraper/${DEFAULT_PARSEBOT_SCRAPER_ID}/get_product`

export type ParsebotAlibabaFacts = {
  name?: string | null
  category?: string | null
  categoryPath?: string[]
  unitPriceUsd?: number | null
  moq?: number | null
  packedWeightKg?: number | null
  volumeCbm?: number | null
  unitSize?: string | null
  originCountry?: string | null
  supplierCountry?: string | null
  imageUrl?: string | null
  supplier?: string | null
  supplierBadges?: string[]
  description?: string | null
  hsCode?: string | null
  productId?: string | null
  productCategoryId?: string | null
  quantityUnit?: string | null
  leadTime?: unknown
  packaging?: unknown
  tariffInfo?: unknown
  raw?: unknown
}

export type ParsebotAlibabaResult =
  | { status: 'ready'; source: string; facts: ParsebotAlibabaFacts; warnings: string[]; executionTime?: number | null }
  | { status: 'not_configured'; source: 'Parse.bot'; facts: null; warnings: string[]; missing: string[] }
  | { status: 'unavailable'; source: 'Parse.bot'; facts: null; warnings: string[]; httpStatus?: number }

function cleanString(value: unknown, max = 500) {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized ? normalized.slice(0, max) : null
}

function cleanStringArray(value: unknown, maxItems = 20, maxLength = 180) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => cleanString(item, maxLength))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems)
}

function numberOrNull(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null
  if (typeof value !== 'string') return null
  const match = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  const n = match ? Number(match[0]) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
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

function normalizeSpecName(value: unknown) {
  return cleanString(value, 120)?.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() || ''
}

function specifications(root: any): Array<{ name?: unknown; value?: unknown }> {
  const value = firstPresent(root, ['specifications', 'specs', 'product.specifications', 'data.specifications'])
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

function specificationValue(root: any, names: string[]) {
  const wanted = names.map(normalizeSpecName)
  for (const spec of specifications(root)) {
    const name = normalizeSpecName(spec.name)
    if (wanted.includes(name)) return spec.value
  }
  return null
}

function firstImage(root: any) {
  const value = firstPresent(root, [
    'imageUrl',
    'image_url',
    'main_image',
    'mainImage',
    'image',
    'images',
    'image_urls',
    'product.images',
    'product.image_urls',
    'thumbnail',
    'thumbnail_url',
  ])
  if (Array.isArray(value)) return cleanString(value.find((item) => typeof item === 'string'))
  return cleanString(value)
}

function priceFromTiers(root: any) {
  const tiers = firstPresent(root, ['price_tiers', 'priceTiers', 'tiers', 'product.price_tiers'])
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
  if (text && /\b(?:g|gram|grams)\b/i.test(text) && !/\bkg\b|kilogram/i.test(text)) return Number((amount / 1000).toFixed(6))
  return amount
}

function volumeToCbm(value: unknown) {
  const text = cleanString(value, 160)
  const amount = numberOrNull(value)
  if (!amount) return null
  if (text && /\b(?:cm3|cm\^3|cubic\s*centimet)/i.test(text)) return Number((amount / 1_000_000).toFixed(6))
  if (text && /\b(?:litre|liter|litres|liters|l)\b/i.test(text) && !/\bml\b/i.test(text)) return Number((amount / 1000).toFixed(6))
  return amount
}

function dimensionsToCbm(value: unknown) {
  let text = cleanString(value, 200)
  if (!text && value && typeof value === 'object') {
    const root: any = value
    const length = numberOrNull(root.length ?? root.l)
    const width = numberOrNull(root.width ?? root.w)
    const height = numberOrNull(root.height ?? root.h)
    if (!length || !width || !height) return null
    const unit = cleanString(root.unit ?? root.units, 30) || 'cm'
    text = `${length}x${width}x${height} ${unit}`
  }
  if (!text) return null
  const dims = text.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) || []
  if (dims.length !== 3 || dims.some((n) => !Number.isFinite(n) || n <= 0)) return null
  const factor = /\bmm\b/i.test(text) ? 0.001 : /\bm\b|meters?|metres?/i.test(text) && !/\bcm\b/i.test(text) ? 1 : 0.01
  const cbm = dims.reduce((product, n) => product * n * factor, 1)
  return Number.isFinite(cbm) && cbm > 0 ? Number(cbm.toFixed(6)) : null
}

function compactSpecsDescription(root: any) {
  const specs = specifications(root)
  if (!specs.length) return null
  const parts = specs
    .map((spec) => {
      const name = cleanString(spec.name, 80)
      const value = cleanString(spec.value, 160)
      return name && value ? `${name}: ${value}` : null
    })
    .filter(Boolean)
    .slice(0, 14)
  return parts.length ? `Specifications: ${parts.join('; ')}` : null
}

function normalizeFacts(raw: unknown): ParsebotAlibabaFacts {
  const root: any = raw && typeof raw === 'object' ? raw : {}
  const data = root.data && typeof root.data === 'object' ? root.data : root
  const product = data.product && typeof data.product === 'object' ? data.product : data
  const packaging = product.packaging && typeof product.packaging === 'object' ? product.packaging : data.packaging || {}
  const shipping = product.shipping_info && typeof product.shipping_info === 'object'
    ? product.shipping_info
    : product.shippingInfo && typeof product.shippingInfo === 'object'
      ? product.shippingInfo
      : data.shipping_info || data.shippingInfo || {}

  const priceValue = priceFromTiers(product) ?? firstPresent(product, [
    'unitPriceUsd',
    'unit_price_usd',
    'price_usd',
    'priceMinUsd',
    'price_min_usd',
    'price.min_usd',
    'price.min',
    'price.low',
    'price_value',
    'priceValue',
    'price',
    'unitPrice',
    'unit_price',
    'min_price',
    'minPrice',
  ]) ?? priceFromDisplay(firstPresent(product, ['price_display', 'priceDisplay', 'display_price']))

  const moqValue = firstPresent(product, ['moq', 'minimum_order_quantity', 'minimumOrderQuantity', 'min_order', 'minOrder', 'minimum_order'])
  const weightValue = firstPresent(product, [
    'unit_weight',
    'unitWeight',
    'packedWeightKg',
    'packed_weight_kg',
    'weightKg',
    'weight_kg',
    'package_weight_kg',
    'package_weight',
    'packaging.package_weight',
    'packaging.weight_kg',
    'shipping_info.unit_weight',
    'shippingInfo.unitWeight',
  ]) ?? firstPresent(packaging, ['package_weight', 'weight', 'weight_kg', 'packedWeightKg', 'weightKg']) ?? firstPresent(shipping, ['unit_weight', 'unitWeight', 'weight'])
  const volumeValue = firstPresent(product, [
    'unit_volume',
    'unitVolume',
    'volumeCbm',
    'volume_cbm',
    'package_volume_cbm',
    'packaging.volume_cbm',
  ]) ?? firstPresent(packaging, ['unit_volume', 'volume', 'volume_cbm', 'volumeCbm'])
  const dimensionsValue = firstPresent(product, [
    'unit_size',
    'unitSize',
    'shipping_info.unit_size',
    'shippingInfo.unitSize',
    'package_size',
    'package_dimensions',
    'packaging.package_dimensions',
    'dimensions',
  ]) ?? firstPresent(shipping, ['unit_size', 'unitSize', 'package_size', 'package_dimensions', 'dimensions'])
    ?? firstPresent(packaging, ['package_dimensions', 'unit_size', 'dimensions', 'size'])

  // Supplier country is not the same thing as country of origin. Only explicit product-origin
  // evidence can populate originCountry; supplier_country is kept separately.
  const originValue = firstPresent(product, ['originCountry', 'origin_country', 'country_of_origin'])
    ?? specificationValue(product, ['place of origin', 'origin', 'country of origin', 'country/region', 'country region'])
  const supplierCountryValue = firstPresent(product, ['supplier_country', 'supplierCountry', 'supplier.country'])
  const title = firstPresent(product, ['name', 'title', 'product_name', 'productName'])
  const categoryPath = cleanStringArray(firstPresent(product, ['category_path', 'categoryPath', 'breadcrumb', 'breadcrumbs']), 16, 180)
  const categoryValue = firstPresent(product, ['category', 'product_category', 'productCategory', 'type', 'product_type'])
    ?? categoryPath[categoryPath.length - 1]
  const explicitDescription = firstPresent(product, ['description', 'summary', 'product_description'])
  const specDescription = compactSpecsDescription(product)
  const categoryDescription = categoryPath.length ? `Category path: ${categoryPath.join(' > ')}` : null
  const description = [cleanString(explicitDescription, 900), specDescription, categoryDescription].filter(Boolean).join(' · ') || null

  return {
    name: cleanString(title, 700),
    category: cleanString(categoryValue, 300),
    categoryPath,
    unitPriceUsd: numberOrNull(priceValue),
    moq: numberOrNull(moqValue),
    packedWeightKg: weightKg(weightValue),
    volumeCbm: volumeToCbm(volumeValue) ?? dimensionsToCbm(dimensionsValue),
    unitSize: cleanString(dimensionsValue, 200),
    originCountry: cleanString(originValue, 120),
    supplierCountry: cleanString(supplierCountryValue, 120),
    imageUrl: firstImage(product) || firstImage(data),
    supplier: cleanString(firstPresent(product, ['supplier', 'supplier_name', 'supplierName', 'supplier.name', 'company', 'company_name']), 300),
    supplierBadges: cleanStringArray(firstPresent(product, ['supplier_badges', 'supplierBadges']), 20, 120),
    description: cleanString(description, 1800),
    hsCode: cleanString(firstPresent(product, ['hs_code', 'hsCode']), 120),
    productId: cleanString(firstPresent(product, ['product_id', 'productId', 'id']), 100),
    productCategoryId: cleanString(firstPresent(product, ['product_category_id', 'productCategoryId']), 100),
    quantityUnit: cleanString(firstPresent(product, ['quantity_unit', 'quantityUnit']), 80),
    leadTime: firstPresent(product, ['lead_time', 'leadTime']),
    packaging: firstPresent(product, ['packaging']),
    tariffInfo: firstPresent(product, ['tariff_info', 'tariffInfo']),
    raw,
  }
}

function parsebotEndpoint(env: ParsebotEnv) {
  const endpointUrl = cleanString(env.PARSEBOT_ENDPOINT_URL, 1000)
  if (endpointUrl) return endpointUrl
  const scraperId = cleanString(env.PARSEBOT_SCRAPER_ID, 200)
  const endpointName = cleanString(env.PARSEBOT_ENDPOINT_NAME, 200)
  if (scraperId && endpointName) {
    return `https://api.parse.bot/scraper/${encodeURIComponent(scraperId)}/${encodeURIComponent(endpointName)}`
  }
  return DEFAULT_PARSEBOT_ALIBABA_ENDPOINT
}

function parsebotSearchEndpoint(env: ParsebotEnv) {
  const scraperId = cleanString(env.PARSEBOT_SCRAPER_ID, 200) || DEFAULT_PARSEBOT_SCRAPER_ID
  const endpointUrl = cleanString(env.PARSEBOT_ENDPOINT_URL, 1000)
  if (endpointUrl) {
    return endpointUrl.replace(/\/get_product(?:\?.*)?$/i, '/search_products')
  }
  return `https://api.parse.bot/scraper/${encodeURIComponent(scraperId)}/search_products`
}

export function parsebotConfigStatus(env: ParsebotEnv) {
  const missing: string[] = []
  if (!env.PARSEBOT_API_KEY) missing.push('PARSEBOT_API_KEY')
  return {
    status: missing.length ? 'not_configured' : 'configured',
    ready: missing.length === 0,
    missing,
  }
}

function alibabaProductId(url: URL) {
  const fromHtml = url.pathname.match(/_(\d{8,})\.html/i)?.[1]
  if (fromHtml) return fromHtml
  return url.pathname.match(/(?:^|\/)(\d{8,})(?:\.html)?(?:$|\/)/i)?.[1] || null
}

function alibabaQueryFromUrl(url: URL) {
  const slug = url.pathname.split('/').filter(Boolean).find((part) => part.includes('_')) || ''
  const namePart = slug.replace(/_\d+\.html$/i, '').replace(/\.html$/i, '')
  const query = namePart.replace(/[-_]+/g, ' ').replace(/\bnewest\b/gi, '').trim()
  return query || 'smart wifi video door phone'
}

function productIdFromRaw(raw: unknown) {
  const root: any = raw && typeof raw === 'object' ? raw : {}
  const id = firstPresent(root, ['product_id', 'productId', 'id', 'item_id', 'offer_id', 'product.product_id', 'product.id'])
  return cleanString(id, 80)
}

type ParsebotAttempt = {
  method: 'GET' | 'POST'
  params: Record<string, string>
}

function withQuery(endpoint: string, params: Record<string, string>) {
  const target = new URL(endpoint)
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value)
  return target.toString()
}

async function callParsebot(endpoint: string, apiKey: string, attempt: ParsebotAttempt, timeoutMs = 3500) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | null = null
  const headers = {
    accept: 'application/json',
    'x-api-key': apiKey,
    'user-agent': 'ShippingAPP/2.6 ParsebotAlibaba',
  }
  const request = attempt.method === 'GET'
    ? fetch(withQuery(endpoint, attempt.params), { method: 'GET', headers, signal: controller.signal })
    : fetch(endpoint, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(attempt.params),
      signal: controller.signal,
    })
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error(`Parse.bot ${attempt.method} timeout after ${timeoutMs}ms`))
    }, timeoutMs)
  })
  const response = await Promise.race([request, timeout])
  if (timer) clearTimeout(timer)
  const text = await response.text()
  let body: any = null
  try { body = text ? JSON.parse(text) : null } catch { body = { raw_output: text } }
  return { response, body }
}

function attemptLabel(attempt: ParsebotAttempt) {
  return `${attempt.method} ${Object.keys(attempt.params).join('+')}`
}

function parsebotAttempts(url: URL): ParsebotAttempt[] {
  const urlString = url.toString()
  const productId = alibabaProductId(url)
  if (productId) {
    return [
      { method: 'GET', params: { product_id: productId } },
      { method: 'GET', params: { id: productId } },
      { method: 'GET', params: { url: urlString } },
      { method: 'POST', params: { url: urlString, product_url: urlString, product_id: productId, id: productId } },
    ]
  }
  return [
    { method: 'GET', params: { url: urlString } },
    { method: 'POST', params: { url: urlString, product_url: urlString } },
  ]
}

function firstProductCandidate(body: any): any | null {
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
  for (const list of candidates) {
    if (Array.isArray(list)) {
      const item = list.find((entry) => entry && typeof entry === 'object')
      if (item) return item
    }
  }
  if (Array.isArray(data)) return data.find((entry) => entry && typeof entry === 'object') ?? null
  return data && typeof data === 'object' ? data : null
}

async function lookupProduct(endpoint: string, apiKey: string, attempt: ParsebotAttempt, failures: string[]) {
  let result: Awaited<ReturnType<typeof callParsebot>>
  try {
    result = await callParsebot(endpoint, apiKey, attempt)
  } catch (error) {
    failures.push(`${attemptLabel(attempt)} -> ${error instanceof Error ? error.message : 'timeout'}`)
    return null
  }
  const { response, body } = result
  if (!response.ok || body?.status === 'error' || body?.status === 'timeout') {
    failures.push(`${attemptLabel(attempt)} -> ${body?.status || `HTTP ${response.status}`}`)
    return null
  }
  const facts = normalizeFacts(body?.data ?? body)
  const useful = Boolean(facts.name || facts.unitPriceUsd || facts.moq || facts.packedWeightKg || facts.volumeCbm || facts.category || facts.imageUrl)
  if (!useful) {
    failures.push(`${attemptLabel(attempt)} -> no usable product facts`)
    return null
  }
  return { facts, body }
}

export async function extractAlibabaWithParsebot(url: URL, env: ParsebotEnv): Promise<ParsebotAlibabaResult> {
  const config = parsebotConfigStatus(env)
  if (!config.ready) {
    return {
      status: 'not_configured',
      source: 'Parse.bot',
      facts: null,
      missing: config.missing,
      warnings: [`Parse.bot extractor is missing configuration: ${config.missing.join(', ')}.`],
    }
  }

  const endpoint = parsebotEndpoint(env)
  if (!endpoint || !env.PARSEBOT_API_KEY) {
    return {
      status: 'not_configured',
      source: 'Parse.bot',
      facts: null,
      missing: ['PARSEBOT endpoint'],
      warnings: ['Parse.bot endpoint could not be resolved.'],
    }
  }

  const failures: string[] = []
  let lastStatus: number | undefined
  try {
    for (const attempt of parsebotAttempts(url)) {
      const productLookup = await lookupProduct(endpoint, env.PARSEBOT_API_KEY, attempt, failures)
      if (productLookup) {
        return {
          status: 'ready',
          source: `Parse.bot · ${attemptLabel(attempt)}`,
          facts: productLookup.facts,
          executionTime: numberOrNull(productLookup.body?.execution_time),
          warnings: [],
        }
      }
    }

    const searchEndpoint = parsebotSearchEndpoint(env)
    const searchAttempt: ParsebotAttempt = { method: 'GET', params: { query: alibabaQueryFromUrl(url), page: '1', sort: 'best_match' } }
    let searchResult: Awaited<ReturnType<typeof callParsebot>> | null = null
    try {
      searchResult = await callParsebot(searchEndpoint, env.PARSEBOT_API_KEY, searchAttempt, 6000)
      lastStatus = searchResult.response.status
    } catch (error) {
      failures.push(`${attemptLabel(searchAttempt)} -> ${error instanceof Error ? error.message : 'timeout'}`)
    }

    if (searchResult && searchResult.response.ok && searchResult.body?.status !== 'error' && searchResult.body?.status !== 'timeout') {
      const candidate = firstProductCandidate(searchResult.body)
      const candidateFacts = normalizeFacts(candidate)
      const candidateProductId = productIdFromRaw(candidate)
      if (candidateProductId) {
        const detailLookup = await lookupProduct(endpoint, env.PARSEBOT_API_KEY, { method: 'GET', params: { product_id: candidateProductId } }, failures)
        if (detailLookup) {
          return {
            status: 'ready',
            source: 'Parse.bot · search_products → get_product',
            facts: detailLookup.facts,
            executionTime: numberOrNull(detailLookup.body?.execution_time),
            warnings: [],
          }
        }
      }
      if (candidate && Boolean(candidateFacts.name || candidateFacts.unitPriceUsd || candidateFacts.moq || candidateFacts.packedWeightKg || candidateFacts.volumeCbm || candidateFacts.category || candidateFacts.imageUrl)) {
        return {
          status: 'ready',
          source: 'Parse.bot · search_products',
          facts: candidateFacts,
          executionTime: numberOrNull(searchResult.body?.execution_time),
          warnings: candidateProductId ? [`Parse.bot get_product failed for search result ${candidateProductId}; using search_products summary.`] : ['Parse.bot search_products returned product facts without a detail product_id.'],
        }
      }
      failures.push('GET search_products -> no usable product facts')
    } else if (searchResult) {
      failures.push(`GET search_products -> ${searchResult.body?.status || `HTTP ${searchResult.response.status}`}`)
    }

    return {
      status: 'unavailable',
      source: 'Parse.bot',
      facts: null,
      httpStatus: lastStatus,
      warnings: [`Parse.bot did not return usable product facts (${failures.slice(0, 5).join('; ')}); ShippingAPP will fall back to Browser Run.`],
    }
  } catch (error) {
    return {
      status: 'unavailable',
      source: 'Parse.bot',
      facts: null,
      httpStatus: lastStatus,
      warnings: [error instanceof Error ? `Parse.bot failed: ${error.message}` : 'Parse.bot failed; ShippingAPP will fall back to Browser Run.'],
    }
  }
}
