import { originalSupplierText, type SupplierEvidence } from '../src/lib/supplierEvidence'
import { parseWeightKg } from './weightUnits'
import { createAlibabaReadBudget, type AlibabaReadBudget, type AlibabaReadOptions } from './alibabaReadBudget'
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
  supplierEvidence?: SupplierEvidence
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

export type ParsebotReadAttemptDiagnostic = {
  method: 'GET' | 'POST'
  outcome: 'ready' | 'timeout' | 'error' | 'http_error' | 'no_facts' | 'mismatched_id'
  durationMs: number
  httpStatus?: number
}
type ParsebotReadDiagnostics = { attempts: ParsebotReadAttemptDiagnostic[] }

export type ParsebotAlibabaResult =
  | { status: 'ready'; source: string; facts: ParsebotAlibabaFacts; warnings: string[]; executionTime?: number | null; diagnostics?: ParsebotReadDiagnostics }
  | { status: 'not_configured'; source: 'Parse.bot'; facts: null; warnings: string[]; missing: string[]; diagnostics?: ParsebotReadDiagnostics }
  | { status: 'unavailable'; source: 'Parse.bot'; facts: null; warnings: string[]; httpStatus?: number; diagnostics?: ParsebotReadDiagnostics }

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

const weightKg = parseWeightKg

function volumeToCbm(value: unknown) {
  const text = cleanString(value, 160)
  const amount = numberOrNull(value)
  if (!amount) return null
  if (text && /\b(?:cm3|cm\^3|cubic\s*centimet)/i.test(text)) return Number((amount / 1_000_000).toFixed(6))
  if (text && /\b(?:litre|liter|litres|liters|l)\b/i.test(text) && !/\bml\b/i.test(text)) return Number((amount / 1000).toFixed(6))
  return amount
}

function dimensionFactor(value: unknown) {
  const unit = cleanString(value, 40)?.toLowerCase()
  if (!unit) return null
  if (/^(?:mm|millimet(?:er|re)s?)$/.test(unit)) return 0.001
  if (/^(?:cm|centimet(?:er|re)s?)$/.test(unit)) return 0.01
  if (/^(?:m|met(?:er|re)s?)$/.test(unit)) return 1
  return null
}

function dimensionsToCbm(value: unknown, declaredUnit?: unknown) {
  let text = cleanString(value, 200)
  if (!text && value && typeof value === 'object') {
    const root: any = value
    const length = numberOrNull(root.length ?? root.l)
    const width = numberOrNull(root.width ?? root.w)
    const height = numberOrNull(root.height ?? root.h)
    if (!length || !width || !height) return null
    const unit = cleanString(root.unit ?? root.units ?? declaredUnit, 30)
    if (!dimensionFactor(unit)) return null
    text = `${length}x${width}x${height} ${unit}`
  }
  if (!text) return null
  const matched = text.match(/(\d+(?:[.,]\d+)?)\s*(?:mm|cm|m)?\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(?:mm|cm|m)?\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i)
  const dims = matched?.slice(1).map(value => Number(value.replace(',', '.'))) || []
  if (dims.length !== 3 || dims.some((n) => !Number.isFinite(n) || n <= 0)) return null
  // A bare "500X1430X1420" can be mm or cm. The provider did not declare a
  // unit, so retain the original dimensions and ask the user instead of making
  // a 1,000-fold assumption about the freight volume.
  if (/(?:^|[^a-z])(?:inches?|feet|foot|ft|yd)(?:$|[^a-z])/i.test(text)) return null
  const units = [...text.matchAll(/(?:^|[^a-z])(mm|cm|m|millimet(?:er|re)s?|centimet(?:er|re)s?|met(?:er|re)s?)(?=$|[^a-z])/gi)]
    .map(match => dimensionFactor(match[1]))
  const declaredFactor = dimensionFactor(declaredUnit)
  if (declaredFactor) units.push(declaredFactor)
  const uniqueFactors = [...new Set(units)]
  if (uniqueFactors.length !== 1 || !uniqueFactors[0]) return null
  const factor = uniqueFactors[0]
  const cbm = dims.reduce((product, n) => product * n * factor, 1)
  return Number.isFinite(cbm) && cbm > 0 ? Number(cbm.toPrecision(12)) : null
}

function dimensionEvidence(value: unknown) {
  const original = originalSupplierText(value)
  if (original || !value || typeof value !== 'object') return original
  const object: any = value
  const parts = [object.length ?? object.l, object.width ?? object.w, object.height ?? object.h].map(originalSupplierText)
  if (!parts.every(Boolean)) return null
  const unit = originalSupplierText(object.unit ?? object.units)
  return `${parts.join(' x ')}${unit ? ` ${unit}` : ''}`
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
    'packedWeightKg',
    'packed_weight_kg',
    'package_weight_kg',
    'package_weight',
    'packaging.package_weight',
    'packaging.weight_kg',
    'packaging.weight',
    'packaging.gross_weight',
    'gross_weight',
    'grossWeight',
    'shipping_info.gross_weight',
    'shippingInfo.grossWeight',
    'shipping_info.unit_weight',
    'shippingInfo.unitWeight',
  ]) ?? firstPresent(packaging, ['package_weight', 'weight', 'weight_kg', 'packedWeightKg', 'weightKg'])
    ?? firstPresent(shipping, ['unit_weight', 'unitWeight', 'weight'])
    // Parse.bot's unit_weight field uses the provider's kg convention. Generic
    // product/net weight aliases do not establish the packed shipping weight.
    ?? firstPresent(product, ['unit_weight', 'unitWeight'])
  const weightEvidenceValue = weightValue ?? firstPresent(product, ['net_weight', 'netWeight', 'weightKg', 'weight_kg'])
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
  const dimensionsUnit = firstPresent(product, ['unit_size_unit', 'size_unit', 'dimension_unit', 'dimensions_unit'])
    ?? firstPresent(shipping, ['unit_size_unit', 'size_unit', 'dimension_unit', 'dimensions_unit', 'dimensionUnit', 'dimensionsUnit'])
    ?? firstPresent(packaging, ['unit_size_unit', 'size_unit', 'dimension_unit', 'dimensions_unit', 'dimensionUnit', 'dimensionsUnit'])

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
    supplierEvidence: {
      priceText: cleanString(firstPresent(product, ['price_display', 'priceDisplay', 'unit_price', 'unitPrice']), 300) || originalSupplierText(priceValue),
      currency: cleanString(firstPresent(product, ['priceCurrency', 'currency', 'currency_code']), 30),
      quantityUnit: cleanString(firstPresent(product, ['quantity_unit', 'quantityUnit']), 80),
      variant: cleanString(firstPresent(product, ['sku_name', 'model']), 300),
      weightText: originalSupplierText(weightEvidenceValue), moqText: originalSupplierText(moqValue),
      volumeText: originalSupplierText(volumeValue) || dimensionEvidence(dimensionsValue),
      priceSource: 'Datos estructurados del proveedor', weightSource: weightValue !== null ? 'Datos estructurados del proveedor' : 'Peso del producto; confirmar el peso embalado',
      moqSource: 'Datos estructurados del proveedor', volumeSource: 'Datos estructurados del proveedor',
    },
    moq: numberOrNull(moqValue),
    packedWeightKg: weightKg(weightValue),
    volumeCbm: volumeToCbm(volumeValue) ?? dimensionsToCbm(dimensionsValue, dimensionsUnit),
    unitSize: dimensionEvidence(dimensionsValue),
    originCountry: cleanString(originValue, 120),
    supplierCountry: cleanString(supplierCountryValue, 120),
    imageUrl: firstImage(product) || firstImage(data),
    supplier: cleanString(firstPresent(product, ['supplier', 'supplier_name', 'supplierName', 'supplier.name', 'company', 'company_name']), 300),
    supplierBadges: cleanStringArray(firstPresent(product, ['supplier_badges', 'supplierBadges']), 20, 120),
    description: cleanString(description, 1800),
    hsCode: cleanString(firstPresent(product, ['hs_code', 'hsCode']), 120),
    productId: productIdFromRaw(product),
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
  const data = root.data && typeof root.data === 'object' ? root.data : root
  const id = firstPresent(data, ['product_id', 'productId', 'id', 'item_id', 'offer_id', 'product.product_id', 'product.productId', 'product.id'])
  if (typeof id === 'number' && Number.isSafeInteger(id)) return String(id)
  const explicit = cleanString(id, 80)
  if (explicit) return explicit
  const productUrl = firstPresent(data, ['product_url', 'productUrl', 'url', 'detail_url', 'product.product_url', 'product.url'])
  if (typeof productUrl !== 'string') return null
  try {
    const target = new URL(productUrl)
    if (target.protocol !== 'https:' || !(target.hostname === 'alibaba.com' || target.hostname.endsWith('.alibaba.com'))) return null
    return alibabaProductId(target)
  } catch { return null }
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

async function callParsebot(endpoint: string, apiKey: string, attempt: ParsebotAttempt, budget: AlibabaReadBudget, timeoutMs = budget.remainingMs()) {
  const headers = {
    accept: 'application/json',
    'x-api-key': apiKey,
    'user-agent': 'ShippingAPP/2.6 ParsebotAlibaba',
  }
  return budget.run(async signal => {
    const response = attempt.method === 'GET'
      ? await fetch(withQuery(endpoint, attempt.params), { method: 'GET', headers, signal })
      : await fetch(endpoint, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(attempt.params), signal })
    // Body buffering is part of the same deadline; receiving headers alone
    // must never leave product reading stuck beyond the customer budget.
    const text = await response.text()
    let body: any = null
    try { body = text ? JSON.parse(text) : null } catch { body = { raw_output: text } }
    return { response, body }
  }, timeoutMs)
}

function attemptLabel(attempt: ParsebotAttempt) {
  return `${attempt.method} ${Object.keys(attempt.params).join('+')}`
}

function parsebotAttempts(url: URL): ParsebotAttempt[] {
  const urlString = url.toString()
  const productId = alibabaProductId(url)
  if (productId) {
    return [
      // The canonical product_id lookup recovered this exact listing in the
      // production probe. Give it useful time before one URL-body fallback;
      // aliases of the same lookup only add duplicate provider work.
      { method: 'GET', params: { product_id: productId } },
      { method: 'POST', params: { url: urlString, product_url: urlString, product_id: productId, id: productId } },
    ]
  }
  return [
    { method: 'POST', params: { url: urlString, product_url: urlString } },
    { method: 'GET', params: { url: urlString } },
  ]
}

function productCandidates(body: any): any[] {
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
  const entries = candidates.flatMap(list => Array.isArray(list) ? list.filter(entry => entry && typeof entry === 'object') : [])
  if (entries.length) return entries
  if (Array.isArray(data)) return data.filter((entry) => entry && typeof entry === 'object')
  return data && typeof data === 'object' ? [data] : []
}

async function lookupProduct(endpoint: string, apiKey: string, attempt: ParsebotAttempt, failures: string[], budget: AlibabaReadBudget, diagnostics: ParsebotReadAttemptDiagnostic[], timeoutMs = budget.remainingMs()) {
  const started = Date.now()
  const record = (outcome: ParsebotReadAttemptDiagnostic['outcome'], httpStatus?: number) => diagnostics.push({ method: attempt.method, outcome, durationMs: Date.now() - started, ...(httpStatus === undefined ? {} : { httpStatus }) })
  let result: Awaited<ReturnType<typeof callParsebot>>
  try {
    result = await callParsebot(endpoint, apiKey, attempt, budget, timeoutMs)
  } catch (error) {
    record(error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'error')
    failures.push(`${attemptLabel(attempt)} -> ${error instanceof Error ? error.message : 'timeout'}`)
    return null
  }
  const { response, body } = result
  if (!response.ok || body?.status === 'error' || body?.status === 'timeout') {
    record('http_error', response.status)
    failures.push(`${attemptLabel(attempt)} -> ${body?.status || `HTTP ${response.status}`}`)
    return null
  }
  const facts = normalizeFacts(body?.data ?? body)
  const expectedId = attempt.params.product_id || attempt.params.id || (attempt.params.url ? alibabaProductId(new URL(attempt.params.url)) : null)
  const returnedId = productIdFromRaw(body?.data ?? body)
  if (expectedId && returnedId && expectedId !== returnedId) {
    record('mismatched_id', response.status)
    failures.push(`${attemptLabel(attempt)} -> product_id does not match the requested publication`)
    return null
  }
  const useful = Boolean(facts.name || facts.unitPriceUsd || facts.moq || facts.packedWeightKg || facts.volumeCbm || facts.category || facts.imageUrl)
  if (!useful) {
    record('no_facts', response.status)
    failures.push(`${attemptLabel(attempt)} -> no usable product facts`)
    return null
  }
  record('ready', response.status)
  return { facts, body }
}

export async function extractAlibabaWithParsebot(url: URL, env: ParsebotEnv, options: AlibabaReadOptions = {}): Promise<ParsebotAlibabaResult> {
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
  const budget = createAlibabaReadBudget(options, 12_000)
  const attempts: ParsebotReadAttemptDiagnostic[] = []
  let lastStatus: number | undefined
  const unavailable = (warning: string): ParsebotAlibabaResult => ({
    status: 'unavailable', source: 'Parse.bot', facts: null,
    httpStatus: lastStatus ?? [...attempts].reverse().find(attempt => attempt.httpStatus !== undefined)?.httpStatus,
    diagnostics: { attempts }, warnings: [warning],
  })
  try {
    for (const [index, attempt] of parsebotAttempts(url).entries()) {
      if (budget.remainingMs() <= 0 || options.signal?.aborted) break
      // A 5–7 second real supplier response is useful, not a failed attempt.
      // Keep room for a single fallback inside the same 12-second budget.
      const attemptMs = index === 0 ? Math.min(8_000, budget.remainingMs()) : budget.remainingMs()
      const productLookup = await lookupProduct(endpoint, env.PARSEBOT_API_KEY, attempt, failures, budget, attempts, attemptMs)
      if (productLookup) {
        return {
          status: 'ready',
          source: `Parse.bot · ${attemptLabel(attempt)}`,
          facts: productLookup.facts,
          executionTime: numberOrNull(productLookup.body?.execution_time),
          diagnostics: { attempts },
          warnings: failures.length ? [`La lectura estructurada recuperó la publicación después de ${failures.length} intento(s) sin datos útiles.`] : [],
        }
      }
      const status = attempts.at(-1)?.httpStatus
      if (status && [401, 402, 403, 429].includes(status)) {
        return unavailable(`Parse.bot returned HTTP ${status}; another lookup was not started with the same credentials or exhausted quota.`)
      }
    }

    if (budget.remainingMs() < 1_000 || options.signal?.aborted) {
      return unavailable(`Parse.bot did not return usable product facts within the remaining read budget (${failures.slice(0, 5).join('; ')}).`)
    }

    const searchEndpoint = parsebotSearchEndpoint(env)
    const searchAttempt: ParsebotAttempt = { method: 'GET', params: { query: alibabaQueryFromUrl(url), page: '1', sort: 'best_match' } }
    let searchResult: Awaited<ReturnType<typeof callParsebot>> | null = null
    const searchStarted = Date.now()
    let searchDiagnostic: ParsebotReadAttemptDiagnostic | undefined
    try {
      searchResult = await callParsebot(searchEndpoint, env.PARSEBOT_API_KEY, searchAttempt, budget, 6000)
      lastStatus = searchResult.response.status
      searchDiagnostic = { method: 'GET', outcome: searchResult.response.ok ? 'no_facts' : 'http_error', durationMs: Date.now() - searchStarted, httpStatus: searchResult.response.status }
      attempts.push(searchDiagnostic)
    } catch (error) {
      attempts.push({ method: 'GET', outcome: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'error', durationMs: Date.now() - searchStarted })
      failures.push(`${attemptLabel(searchAttempt)} -> ${error instanceof Error ? error.message : 'timeout'}`)
    }

    if (searchResult && searchResult.response.ok && searchResult.body?.status !== 'error' && searchResult.body?.status !== 'timeout') {
      const requestedId = alibabaProductId(url)
      const candidate = requestedId ? productCandidates(searchResult.body).find(entry => productIdFromRaw(entry) === requestedId) : null
      const candidateFacts = normalizeFacts(candidate)
      const candidateProductId = productIdFromRaw(candidate)
      if (searchDiagnostic && candidate) searchDiagnostic.outcome = 'ready'
      else if (searchDiagnostic && productCandidates(searchResult.body).length) searchDiagnostic.outcome = 'mismatched_id'
      if (candidate && candidateProductId === requestedId && Boolean(candidateFacts.name || candidateFacts.unitPriceUsd || candidateFacts.moq || candidateFacts.packedWeightKg || candidateFacts.volumeCbm || candidateFacts.category || candidateFacts.imageUrl)) {
        return {
          status: 'ready',
          source: 'Parse.bot · search_products',
          facts: candidateFacts,
          executionTime: numberOrNull(searchResult.body?.execution_time),
          diagnostics: { attempts },
          warnings: [`Both direct lookups failed; preserving only the exact product_id ${candidateProductId} search summary without repeating a failed detail lookup.`],
        }
      }
      failures.push('GET search_products -> no usable product facts')
    } else if (searchResult) {
      failures.push(`GET search_products -> ${searchResult.body?.status || `HTTP ${searchResult.response.status}`}`)
    }

    return unavailable(`Parse.bot did not return usable product facts (${failures.slice(0, 5).join('; ')}); GlobalShipping will fall back to Browser Run.`)
  } catch (error) {
    return unavailable(error instanceof Error ? `Parse.bot failed: ${error.message}` : 'Parse.bot failed; GlobalShipping will fall back to Browser Run.')
  } finally {
    budget.dispose()
  }
}
