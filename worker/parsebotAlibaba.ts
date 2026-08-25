type ParsebotEnv = {
  PARSEBOT_API_KEY?: string
  PARSEBOT_ENDPOINT_URL?: string
  PARSEBOT_SCRAPER_ID?: string
  PARSEBOT_ENDPOINT_NAME?: string
}

export type ParsebotAlibabaFacts = {
  name?: string | null
  category?: string | null
  unitPriceUsd?: number | null
  moq?: number | null
  packedWeightKg?: number | null
  volumeCbm?: number | null
  originCountry?: string | null
  imageUrl?: string | null
  supplier?: string | null
  description?: string | null
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

function numberOrNull(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null
  if (typeof value !== 'string') return null
  const cleaned = value
    .replace(/,/g, '')
    .replace(/USD|US\$|\$|pcs?|pieces?|sets?|units?|kg|cbm|m³/gi, '')
    .replace(/[^0-9.\-]/g, '')
  const n = Number(cleaned)
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

function firstImage(root: any) {
  const value = firstPresent(root, ['imageUrl', 'image_url', 'main_image', 'mainImage', 'image', 'images', 'product.images'])
  if (Array.isArray(value)) return cleanString(value.find((item) => typeof item === 'string'))
  return cleanString(value)
}

function normalizeFacts(raw: unknown): ParsebotAlibabaFacts {
  const root: any = raw && typeof raw === 'object' ? raw : {}
  const data = root.data && typeof root.data === 'object' ? root.data : root
  const product = data.product && typeof data.product === 'object' ? data.product : data
  const packaging = product.packaging && typeof product.packaging === 'object' ? product.packaging : data.packaging || {}
  const priceValue = firstPresent(product, [
    'unitPriceUsd', 'unit_price_usd', 'price_usd', 'priceMinUsd', 'price_min_usd', 'price.min_usd', 'price.min', 'price', 'unitPrice', 'unit_price',
  ])
  const moqValue = firstPresent(product, ['moq', 'minimum_order_quantity', 'minimumOrderQuantity', 'min_order', 'minOrder', 'minimum_order'])
  const weightValue = firstPresent(product, ['packedWeightKg', 'packed_weight_kg', 'weightKg', 'weight_kg', 'package_weight_kg', 'packaging.weight_kg']) ?? firstPresent(packaging, ['weight_kg', 'packedWeightKg', 'weightKg'])
  const volumeValue = firstPresent(product, ['volumeCbm', 'volume_cbm', 'package_volume_cbm', 'packaging.volume_cbm']) ?? firstPresent(packaging, ['volume_cbm', 'volumeCbm'])

  return {
    name: cleanString(firstPresent(product, ['name', 'title', 'product_name', 'productName']), 700),
    category: cleanString(firstPresent(product, ['category', 'product_category', 'productCategory']), 300),
    unitPriceUsd: numberOrNull(priceValue),
    moq: numberOrNull(moqValue),
    packedWeightKg: numberOrNull(weightValue),
    volumeCbm: numberOrNull(volumeValue),
    originCountry: cleanString(firstPresent(product, ['originCountry', 'origin_country', 'country_of_origin', 'supplier_country', 'supplier.country']), 120),
    imageUrl: firstImage(product) || firstImage(data),
    supplier: cleanString(firstPresent(product, ['supplier', 'supplier_name', 'supplier.name']), 300),
    description: cleanString(firstPresent(product, ['description', 'summary', 'product_description']), 1500),
    raw,
  }
}

function parsebotEndpoint(env: ParsebotEnv) {
  const endpointUrl = cleanString(env.PARSEBOT_ENDPOINT_URL, 1000)
  if (endpointUrl) return endpointUrl
  const scraperId = cleanString(env.PARSEBOT_SCRAPER_ID, 200)
  const endpointName = cleanString(env.PARSEBOT_ENDPOINT_NAME, 200)
  if (!scraperId || !endpointName) return null
  return `https://api.parse.bot/scraper/${encodeURIComponent(scraperId)}/${encodeURIComponent(endpointName)}`
}

export function parsebotConfigStatus(env: ParsebotEnv) {
  const missing: string[] = []
  if (!env.PARSEBOT_API_KEY) missing.push('PARSEBOT_API_KEY')
  if (!env.PARSEBOT_ENDPOINT_URL && (!env.PARSEBOT_SCRAPER_ID || !env.PARSEBOT_ENDPOINT_NAME)) {
    missing.push('PARSEBOT_ENDPOINT_URL or PARSEBOT_SCRAPER_ID + PARSEBOT_ENDPOINT_NAME')
  }
  return {
    status: missing.length ? 'not_configured' : 'configured',
    ready: missing.length === 0,
    missing,
  }
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

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 22000)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-api-key': env.PARSEBOT_API_KEY,
        'user-agent': 'ShippingAPP/1.9 ParsebotAlibaba',
      },
      body: JSON.stringify({ url: url.toString(), product_url: url.toString(), alibaba_url: url.toString() }),
      signal: controller.signal,
    })
    const text = await response.text()
    let body: any = null
    try { body = text ? JSON.parse(text) : null } catch { body = { raw_output: text } }
    if (!response.ok || body?.status === 'error' || body?.status === 'timeout') {
      return {
        status: 'unavailable',
        source: 'Parse.bot',
        facts: null,
        httpStatus: response.status,
        warnings: [`Parse.bot returned ${body?.status || `HTTP ${response.status}`}; ShippingAPP will fall back to Browser Run.`],
      }
    }
    const facts = normalizeFacts(body?.data ?? body)
    const useful = Boolean(facts.name || facts.unitPriceUsd || facts.moq || facts.packedWeightKg || facts.imageUrl)
    if (!useful) {
      return {
        status: 'unavailable',
        source: 'Parse.bot',
        facts: null,
        httpStatus: response.status,
        warnings: ['Parse.bot responded but did not return usable product facts; ShippingAPP will fall back to Browser Run.'],
      }
    }
    return {
      status: 'ready',
      source: 'Parse.bot',
      facts,
      executionTime: numberOrNull(body?.execution_time),
      warnings: [],
    }
  } catch (error) {
    return {
      status: 'unavailable',
      source: 'Parse.bot',
      facts: null,
      warnings: [error instanceof Error ? `Parse.bot failed: ${error.message}` : 'Parse.bot failed; ShippingAPP will fall back to Browser Run.'],
    }
  } finally {
    clearTimeout(timeout)
  }
}
