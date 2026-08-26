type ParsebotEnv = {
  PARSEBOT_API_KEY?: string
  PARSEBOT_ENDPOINT_URL?: string
  PARSEBOT_SCRAPER_ID?: string
  PARSEBOT_ENDPOINT_NAME?: string
}

const DEFAULT_PARSEBOT_SCRAPER_ID = 'ba2822dd-f985-4faa-8d3b-81d795bda2a7'
const DEFAULT_PARSEBOT_ALIBABA_ENDPOINT = `https://api.parse.bot/scraper/${DEFAULT_PARSEBOT_SCRAPER_ID}/get_product`
const DEFAULT_PARSEBOT_ALIBABA_SEARCH_ENDPOINT = `https://api.parse.bot/scraper/${DEFAULT_PARSEBOT_SCRAPER_ID}/search_products`

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
  const value = firstPresent(root, ['imageUrl', 'image_url', 'main_image', 'mainImage', 'image', 'images', 'product.images', 'thumbnail', 'thumbnail_url'])
  if (Array.isArray(value)) return cleanString(value.find((item) => typeof item === 'string'))
  return cleanString(value)
}

function normalizeFacts(raw: unknown): ParsebotAlibabaFacts {
  const root: any = raw && typeof raw === 'object' ? raw : {}
  const data = root.data && typeof root.data === 'object' ? root.data : root
  const product = data.product && typeof data.product === 'object' ? data.product : data
  const packaging = product.packaging && typeof product.packaging === 'object' ? product.packaging : data.packaging || {}
  const priceValue = firstPresent(product, [
    'unitPriceUsd', 'unit_price_usd', 'price_usd', 'priceMinUsd', 'price_min_usd', 'price.min_usd', 'price.min', 'price.low', 'price', 'unitPrice', 'unit_price', 'min_price', 'minPrice',
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
    supplier: cleanString(firstPresent(product, ['supplier', 'supplier_name', 'supplier.name', 'company', 'company_name']), 300),
    description: cleanString(firstPresent(product, ['description', 'summary', 'product_description']), 1500),
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
    'user-agent': 'ShippingAPP/2.3 ParsebotAlibaba',
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
  const useful = Boolean(facts.name || facts.unitPriceUsd || facts.moq || facts.packedWeightKg || facts.imageUrl)
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
      if (candidate && Boolean(candidateFacts.name || candidateFacts.unitPriceUsd || candidateFacts.moq || candidateFacts.imageUrl)) {
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
