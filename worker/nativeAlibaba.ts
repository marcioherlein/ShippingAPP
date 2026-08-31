import type { BrowserRun } from './alibabaSource'
import { extractAlibabaDirectFacts, type AlibabaDirectFacts } from './alibabaDirectExtract'
import type { ParsebotAlibabaFacts } from './parsebotAlibaba'

export type NativeAlibabaResult =
  | { status: 'ready'; source: 'Cloudflare Browser Run JSON'; facts: ParsebotAlibabaFacts; warnings: string[]; browserMsUsed: number | null }
  | { status: 'unavailable'; source: 'Cloudflare Browser Run JSON'; facts: null; warnings: string[]; httpStatus?: number; browserMsUsed: number | null }

function cleanString(value: unknown, max = 700) {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, max) : null
}

function positiveNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null
  const text = cleanString(value, 120)
  if (!text) return null
  const match = text.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  const n = match ? Number(match[0]) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

function weightKg(value: unknown) {
  const text = cleanString(value, 120)
  const n = positiveNumber(value)
  if (!n) return null
  if (text && /\b(?:g|gram|grams)\b/i.test(text) && !/\bkg\b|kilogram/i.test(text)) return Number((n / 1000).toFixed(6))
  return n
}

function volumeCbm(value: unknown) {
  const text = cleanString(value, 160)
  const n = positiveNumber(value)
  if (!n) return null
  if (text && /\b(?:cm3|cm\^3|cubic\s*centimet)/i.test(text)) return Number((n / 1_000_000).toFixed(6))
  if (text && /\b(?:litre|liter|litres|liters)\b/i.test(text)) return Number((n / 1000).toFixed(6))
  return n
}

function dimensionsToCbm(value: unknown) {
  const text = cleanString(value, 180)
  if (!text) return null
  const dims = text.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) || []
  if (dims.length !== 3 || dims.some((n) => !Number.isFinite(n) || n <= 0)) return null
  const factor = /\bmm\b/i.test(text) ? 0.001 : /\b(?:m|meter|metre)s?\b/i.test(text) && !/\bcm\b/i.test(text) ? 1 : 0.01
  const cbm = dims.reduce((product, n) => product * n * factor, 1)
  return Number.isFinite(cbm) && cbm > 0 ? Number(cbm.toFixed(6)) : null
}

function browserMs(response: Response) {
  const value = Number(response.headers.get('X-Browser-Ms-Used'))
  return Number.isFinite(value) && value >= 0 ? value : null
}

function combinedBrowserMs(...values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0)
  return usable.length ? Number(usable.reduce((sum, value) => sum + value, 0).toFixed(3)) : null
}

function specValue(specs: any[], names: string[]) {
  const wanted = names.map((name) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
  for (const spec of specs) {
    const name = cleanString(spec?.name, 100)?.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (name && wanted.includes(name)) return spec?.value
  }
  return null
}

function productIdFromUrl(url: URL) {
  return url.pathname.match(/_(\d{8,})\.html/i)?.[1] || null
}

function productTitleFromUrl(url: URL) {
  const segment = url.pathname.split('/').filter(Boolean).at(-1) || ''
  const withoutId = segment.replace(/_\d{8,}\.html$/i, '').replace(/\.html$/i, '')
  let decoded = withoutId
  try { decoded = decodeURIComponent(withoutId) } catch { /* keep encoded slug */ }
  const title = decoded.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!title || /^(?:product|product detail|detail)$/i.test(title)) return null
  return title.slice(0, 700)
}

function normalizeResult(raw: any, url: URL): ParsebotAlibabaFacts {
  const root = raw && typeof raw === 'object' ? raw : {}
  const categoryPath = Array.isArray(root.category_path)
    ? root.category_path.map((item: unknown) => cleanString(item, 180)).filter(Boolean).slice(0, 16) as string[]
    : []
  const specs = Array.isArray(root.specifications)
    ? root.specifications.filter((item: unknown) => item && typeof item === 'object').slice(0, 30)
    : []
  const packaging = root.packaging && typeof root.packaging === 'object' ? root.packaging : {}
  const unitSize = cleanString(root.unit_size, 180) || cleanString(packaging.package_dimensions, 180)
  const explicitVolume = volumeCbm(root.unit_volume)
  const origin = cleanString(specValue(specs, ['place of origin', 'country of origin', 'origin', 'country/region', 'country region']), 120)
  const descriptionParts = specs.slice(0, 16).map((spec: any) => {
    const name = cleanString(spec?.name, 90)
    const value = cleanString(spec?.value, 180)
    return name && value ? `${name}: ${value}` : null
  }).filter(Boolean)
  const priceTiers = Array.isArray(root.price_tiers) ? root.price_tiers : []
  const firstTierPrice = priceTiers.map((tier: any) => positiveNumber(tier?.price_value ?? tier?.unit_price)).find(Boolean) || null
  const firstTierMoq = priceTiers
    .map((tier: any) => positiveNumber(tier?.min_quantity ?? tier?.minQuantity ?? tier?.min_qty))
    .filter((value: number | null): value is number => Boolean(value))
    .sort((a: number, b: number) => a - b)[0] || null
  const categoryFromSpecs = cleanString(specValue(specs, ['product type', 'type']), 250)

  return {
    name: cleanString(root.title, 700) || productTitleFromUrl(url),
    category: cleanString(root.product_type, 250) || categoryPath[categoryPath.length - 1] || categoryFromSpecs || null,
    categoryPath,
    unitPriceUsd: positiveNumber(root.unit_price) || firstTierPrice,
    moq: positiveNumber(root.moq) || firstTierMoq,
    packedWeightKg: weightKg(root.unit_weight) || weightKg(packaging.package_weight),
    volumeCbm: explicitVolume || dimensionsToCbm(unitSize),
    unitSize,
    originCountry: origin,
    supplierCountry: cleanString(root.supplier_country, 120),
    imageUrl: cleanString(root.image_url, 1000),
    supplier: cleanString(root.supplier_name, 300),
    supplierBadges: Array.isArray(root.supplier_badges) ? root.supplier_badges.map((item: unknown) => cleanString(item, 120)).filter(Boolean).slice(0, 20) as string[] : [],
    description: descriptionParts.length ? `Specifications: ${descriptionParts.join('; ')}` : null,
    hsCode: cleanString(root.hs_code, 120),
    productId: cleanString(root.product_id, 100) || productIdFromUrl(url),
    productCategoryId: cleanString(root.product_category_id, 100),
    quantityUnit: cleanString(root.quantity_unit, 80),
    leadTime: root.lead_time ?? null,
    packaging: root.packaging ?? null,
    tariffInfo: root.tariff_info ?? null,
    raw,
  }
}

function directFactsToNative(facts: AlibabaDirectFacts, url: URL): ParsebotAlibabaFacts {
  return {
    name: facts.name || productTitleFromUrl(url),
    category: facts.category || facts.categoryPath.at(-1) || null,
    categoryPath: facts.categoryPath,
    unitPriceUsd: facts.unitPriceUsd,
    moq: facts.moq,
    packedWeightKg: facts.packedWeightKg,
    volumeCbm: facts.volumeCbm,
    unitSize: facts.unitSize,
    originCountry: facts.originCountry,
    supplierCountry: null,
    imageUrl: facts.imageUrl,
    supplier: facts.supplier,
    supplierBadges: [],
    description: facts.description,
    hsCode: facts.hsCode,
    productId: facts.productId || productIdFromUrl(url),
    productCategoryId: null,
    quantityUnit: null,
    leadTime: null,
    packaging: null,
    tariffInfo: null,
  }
}

function mergeFacts(primary: ParsebotAlibabaFacts | null, supplement: ParsebotAlibabaFacts | null): ParsebotAlibabaFacts | null {
  if (!primary) return supplement
  if (!supplement) return primary
  return {
    name: primary.name || supplement.name,
    category: primary.category || supplement.category,
    categoryPath: primary.categoryPath.length ? primary.categoryPath : supplement.categoryPath,
    unitPriceUsd: primary.unitPriceUsd || supplement.unitPriceUsd,
    moq: primary.moq || supplement.moq,
    packedWeightKg: primary.packedWeightKg || supplement.packedWeightKg,
    volumeCbm: primary.volumeCbm || supplement.volumeCbm,
    unitSize: primary.unitSize || supplement.unitSize,
    originCountry: primary.originCountry || supplement.originCountry,
    supplierCountry: primary.supplierCountry || supplement.supplierCountry,
    imageUrl: primary.imageUrl || supplement.imageUrl,
    supplier: primary.supplier || supplement.supplier,
    supplierBadges: primary.supplierBadges.length ? primary.supplierBadges : supplement.supplierBadges,
    description: primary.description || supplement.description,
    hsCode: primary.hsCode || supplement.hsCode,
    productId: primary.productId || supplement.productId,
    productCategoryId: primary.productCategoryId || supplement.productCategoryId,
    quantityUnit: primary.quantityUnit || supplement.quantityUnit,
    leadTime: primary.leadTime ?? supplement.leadTime,
    packaging: primary.packaging ?? supplement.packaging,
    tariffInfo: primary.tariffInfo ?? supplement.tariffInfo,
    raw: supplement.raw,
  }
}

function pricesAgree(a: number | null | undefined, b: number | null | undefined, tolerance = 0.08) {
  if (!a || !b) return false
  const denominator = Math.max(a, b)
  return denominator > 0 && Math.abs(a - b) / denominator <= tolerance
}

/** A Browser-extracted tier is usable only when the price is explicitly tied to a minimum quantity. */
function explicitTierPrice(raw: any) {
  const tiers = Array.isArray(raw?.price_tiers) ? raw.price_tiers : []
  for (const tier of tiers) {
    const minQuantity = positiveNumber(tier?.min_quantity ?? tier?.minQuantity ?? tier?.min_qty)
    const price = positiveNumber(tier?.price_value ?? tier?.unit_price)
    if (minQuantity && price) return price
  }
  return null
}

function coreFichaSignals(facts: ParsebotAlibabaFacts | null) {
  if (!facts) return 0
  return [facts.name, facts.category, facts.unitPriceUsd, facts.moq, facts.packedWeightKg, facts.volumeCbm, facts.originCountry].filter(Boolean).length
}

function evidenceSignals(facts: ParsebotAlibabaFacts | null) {
  if (!facts) return 0
  return [facts.name, facts.category, facts.unitPriceUsd, facts.moq, facts.packedWeightKg, facts.volumeCbm, facts.hsCode, facts.description].filter(Boolean).length
}

const responseSchema = {
  type: 'object',
  properties: {
    title: { type: ['string', 'null'] },
    product_type: { type: ['string', 'null'] },
    moq: { type: ['string', 'number', 'null'] },
    unit_price: { type: ['string', 'number', 'null'] },
    unit_weight: { type: ['string', 'number', 'null'] },
    unit_volume: { type: ['string', 'number', 'null'] },
    unit_size: { type: ['string', 'null'] },
    hs_code: { type: ['string', 'null'] },
    product_id: { type: ['string', 'null'] },
    product_category_id: { type: ['string', 'null'] },
    quantity_unit: { type: ['string', 'null'] },
    supplier_name: { type: ['string', 'null'] },
    supplier_country: { type: ['string', 'null'] },
    image_url: { type: ['string', 'null'] },
    category_path: { type: 'array', items: { type: 'string' } },
    supplier_badges: { type: 'array', items: { type: 'string' } },
    specifications: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, value: { type: 'string' } },
        required: ['name', 'value'],
      },
    },
    price_tiers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          min_quantity: { type: ['string', 'number', 'null'] },
          max_quantity: { type: ['string', 'number', 'null'] },
          unit_price: { type: ['string', 'number', 'null'] },
          price_value: { type: ['string', 'number', 'null'] },
        },
      },
    },
    lead_time: { type: ['array', 'object', 'string', 'null'] },
    packaging: {
      type: ['object', 'null'],
      properties: {
        package_dimensions: { type: ['string', 'null'] },
        package_weight: { type: ['string', 'number', 'null'] },
        selling_units: { type: ['string', 'number', 'null'] },
      },
    },
    tariff_info: { type: ['object', 'string', 'null'] },
  },
}

function browserRequest(url: URL) {
  return {
    url: url.toString(),
    prompt: [
      'Extract ONLY facts explicitly visible or embedded in this Alibaba product page. Never infer or estimate missing values.',
      'Inspect the rendered offer, structured page data, breadcrumb, product attributes/specifications, price tiers and logistics/package information when present.',
      'For unit_price, return only the merchandise offer price. Never use coupons, new-buyer incentives, sample prices, shipping/freight charges or unrelated currency amounts.',
      'Prefer logistics/package facts for unit_weight, unit_volume and unit_size; do not confuse product physical dimensions with packed shipping dimensions.',
      'Use category_path for the Alibaba breadcrumb from broadest to most specific. product_type should be the concrete merchandise type, not a marketing phrase.',
      'If MOQ is not separately labelled but a price tier explicitly starts at a minimum quantity, return that minimum in price_tiers.',
      'Return HS code only if Alibaba or the supplier explicitly lists it. Return supplier_country separately from product origin.',
      'For specifications include useful technical attributes such as Product Type, Type, movement, material, function, Place of Origin, model, power, composition or use.',
      'If a requested value is absent, return null or an empty array. Do not fill it from general knowledge.',
    ].join(' '),
    response_format: { type: 'json_schema', json_schema: responseSchema },
  }
}

function renderedContentRequest(url: URL) {
  return {
    url: url.toString(),
    gotoOptions: { waitUntil: 'networkidle2', timeout: 20000 },
    rejectResourceTypes: ['image', 'media', 'font'],
  }
}

async function wait(ms: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, ms))
}

async function extractRenderedHtml(url: URL, browser: BrowserRun) {
  try {
    const response = await browser.quickAction('content', renderedContentRequest(url))
    const ms = browserMs(response)
    if (!response.ok) {
      return {
        facts: null as ParsebotAlibabaFacts | null,
        ms,
        status: response.status,
        warnings: [`Browser Run rendered HTML returned HTTP ${response.status}; structured extraction will be attempted.`],
      }
    }
    const html = await response.text()
    if (!html || html.length < 80) {
      return { facts: null as ParsebotAlibabaFacts | null, ms, status: response.status, warnings: ['Browser Run rendered HTML was empty or too small.'] }
    }
    const direct = extractAlibabaDirectFacts(html, url)
    const facts = directFactsToNative(direct, url)
    if (evidenceSignals(facts) < 2) {
      return {
        facts: null as ParsebotAlibabaFacts | null,
        ms,
        status: response.status,
        warnings: ['Rendered Alibaba HTML did not expose enough trustworthy product facts; structured extraction will be attempted.'],
      }
    }
    return {
      facts,
      ms,
      status: response.status,
      warnings: [`ShippingAPP recovered ${coreFichaSignals(facts)}/7 required ficha signals from rendered Alibaba HTML before structured extraction.`],
    }
  } catch (error) {
    return {
      facts: null as ParsebotAlibabaFacts | null,
      ms: null,
      status: null,
      warnings: [`Rendered Alibaba extraction failed: ${error instanceof Error ? error.message : 'unknown error'}`],
    }
  }
}

export async function extractAlibabaNative(url: URL, browser: BrowserRun): Promise<NativeAlibabaResult> {
  const rendered = await extractRenderedHtml(url, browser)
  const warnings: string[] = [...rendered.warnings]

  // A complete deterministic ficha from the rendered DOM is preferable to an
  // AI/JSON extraction and avoids a second Browser Run request entirely.
  if (rendered.facts && coreFichaSignals(rendered.facts) === 7) {
    warnings.push('La ficha obligatoria quedó completa desde HTML renderizado; no fue necesario ejecutar Browser Run JSON.')
    return {
      status: 'ready',
      source: 'Cloudflare Browser Run JSON',
      facts: rendered.facts,
      warnings,
      browserMsUsed: rendered.ms,
    }
  }

  let response: Response
  let retried429 = false
  try {
    response = await browser.quickAction('json', browserRequest(url))
    if (response.status === 429) {
      retried429 = true
      await wait(750)
      response = await browser.quickAction('json', browserRequest(url))
    }
  } catch (error) {
    if (rendered.facts) {
      warnings.push(`Structured Browser Run failed, but rendered HTML remains usable: ${error instanceof Error ? error.message : 'unknown error'}`)
      return { status: 'ready', source: 'Cloudflare Browser Run JSON', facts: rendered.facts, warnings, browserMsUsed: rendered.ms }
    }
    return {
      status: 'unavailable', source: 'Cloudflare Browser Run JSON', facts: null, browserMsUsed: rendered.ms,
      warnings: [...warnings, `Native Alibaba extraction failed: ${error instanceof Error ? error.message : 'unknown error'}`],
    }
  }

  const jsonMs = browserMs(response)
  const totalMs = combinedBrowserMs(rendered.ms, jsonMs)
  if (!response.ok) {
    if (rendered.facts) {
      warnings.push(`Browser Run JSON returned HTTP ${response.status}${retried429 ? ' after one bounded retry' : ''}; rendered HTML evidence is preserved instead of failing the product.`)
      return { status: 'ready', source: 'Cloudflare Browser Run JSON', facts: rendered.facts, warnings, browserMsUsed: totalMs }
    }
    return {
      status: 'unavailable', source: 'Cloudflare Browser Run JSON', facts: null, browserMsUsed: totalMs, httpStatus: response.status,
      warnings: [...warnings, `Browser Run JSON returned HTTP ${response.status}${retried429 ? ' after one bounded retry' : ''}.`],
    }
  }

  let body: any
  try { body = await response.json() } catch {
    if (rendered.facts) {
      warnings.push('Browser Run JSON returned a non-JSON payload; rendered HTML evidence is preserved.')
      return { status: 'ready', source: 'Cloudflare Browser Run JSON', facts: rendered.facts, warnings, browserMsUsed: totalMs }
    }
    return { status: 'unavailable', source: 'Cloudflare Browser Run JSON', facts: null, browserMsUsed: totalMs, warnings: [...warnings, 'Browser Run JSON returned a non-JSON payload.'] }
  }

  const raw = body?.result ?? body
  const structured = normalizeResult(raw, url)
  const tierPrice = explicitTierPrice(raw)
  const isolatedStructuredPrice = positiveNumber(raw?.unit_price)
  const renderedPrice = rendered.facts?.unitPriceUsd ?? null

  // Browser JSON is semantic extraction from the same page, not independent
  // evidence. Therefore a bare unit_price cannot fill an absent FOB. It may
  // corroborate an already deterministic rendered price, while a quantity-linked
  // price tier can stand on its own because the offer relationship is explicit.
  const structuredPrice = tierPrice || (renderedPrice && isolatedStructuredPrice && pricesAgree(renderedPrice, isolatedStructuredPrice)
    ? isolatedStructuredPrice
    : null)
  const structuredSafe = { ...structured, unitPriceUsd: structuredPrice }

  if (!renderedPrice && isolatedStructuredPrice && !tierPrice) {
    warnings.push('Browser Run expuso un unit_price sin precio determinístico ni tier con cantidad; ShippingAPP lo retuvo como no corroborado y solicita confirmación del proveedor.')
  } else if (renderedPrice && isolatedStructuredPrice && !pricesAgree(renderedPrice, isolatedStructuredPrice)) {
    warnings.push('Browser Run unit_price contradijo el precio determinístico del producto; ShippingAPP conservó la evidencia determinística y descartó el importe estructurado.')
  }
  if (renderedPrice && tierPrice && !pricesAgree(renderedPrice, tierPrice)) {
    warnings.push('El tier de precio estructurado contradijo el precio determinístico; ShippingAPP conservó el precio determinístico y reportó la inconsistencia.')
  }

  const facts = mergeFacts(rendered.facts, structuredSafe)
  const signals = evidenceSignals(facts)
  if (!facts?.name || signals < 2) {
    return {
      status: 'unavailable', source: 'Cloudflare Browser Run JSON', facts: null, browserMsUsed: totalMs,
      warnings: [...warnings, 'Browser Run opened Alibaba but did not expose enough trustworthy product facts.'],
    }
  }

  if (retried429) warnings.push('Browser Run recibió HTTP 429 en el primer intento y recuperó la publicación en un único retry acotado.')
  if (rendered.facts) warnings.push('La extracción estructurada se fusionó con evidencia determinística del HTML renderizado; los valores determinísticos tienen prioridad.')
  if (!facts.unitPriceUsd) warnings.push('Precio unitario FOB no quedó corroborado por evidencia de producto; debe confirmarlo el usuario/proveedor.')
  if (!facts.packedWeightKg) warnings.push('Peso unitario embalado no expuesto por Alibaba; debe confirmarlo el usuario.')
  if (!facts.volumeCbm) warnings.push('Volumen/dimensiones logísticas no expuestos por Alibaba; debe confirmarlo el usuario.')
  if (!facts.originCountry) warnings.push('Origen de la mercadería no expuesto; supplier_country no se usa como sustituto.')
  return { status: 'ready', source: 'Cloudflare Browser Run JSON', facts, warnings, browserMsUsed: totalMs }
}
