export type AlibabaDirectFacts = {
  name: string | null
  category: string | null
  categoryPath: string[]
  unitPriceUsd: number | null
  moq: number | null
  packedWeightKg: number | null
  volumeCbm: number | null
  unitSize: string | null
  originCountry: string | null
  imageUrl: string | null
  supplier: string | null
  description: string | null
  material: string | null
  functionText: string | null
  hsCode: string | null
  productId: string | null
  specifications: Array<{ name: string; value: string }>
  evidence: string[]
}

type JsonObject = Record<string, unknown>
type ScoredObject = { object: JsonObject; score: number }

const PRODUCT_KEYS = new Set([
  'productid', 'product_id', 'subject', 'producttitle', 'product_title', 'productname', 'product_name',
  'moq', 'minimumorderquantity', 'minimum_order_quantity', 'minorderquantity', 'min_order_quantity',
  'categorypath', 'category_path', 'productcategoryid', 'product_category_id', 'hscode', 'hs_code',
  'unitweight', 'unit_weight', 'unitvolume', 'unit_volume', 'packagesize', 'package_size',
])

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
}

function cleanString(value: unknown, max = 800) {
  if (typeof value !== 'string') return null
  const normalized = decodeHtml(value)
    .replace(/\\u0026/g, '&')
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized ? normalized.slice(0, max) : null
}

function positiveNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null
  const text = cleanString(value, 160)
  if (!text) return null
  const match = text.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  const n = match ? Number(match[0]) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '')
}

function normalizeSpecName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function metaValue(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return cleanString(match[1], 1200)
  }
  return null
}

function visibleText(html: string) {
  return decodeHtml(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' '))
    .trim()
    .slice(0, 30000)
}

function parseJsonSafe(value: string) {
  try { return JSON.parse(value) } catch { return null }
}

function findBalancedJson(source: string, start: number) {
  const opener = source[start]
  if (opener !== '{' && opener !== '[') return null
  const closer = opener === '{' ? '}' : ']'
  let depth = 0
  let quote: string | null = null
  let escaped = false
  for (let i = start; i < source.length && i < start + 1_500_000; i += 1) {
    const ch = source[i]
    if (quote) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === opener) depth += 1
    else if (ch === closer) {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  return null
}

function extractJsonRoots(html: string) {
  const roots: unknown[] = []
  for (const script of [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)].slice(0, 160)) {
    const attrs = script[1] || ''
    const body = (script[2] || '').trim()
    if (!body || body.length > 1_500_000) continue
    if (/type=["'](?:application\/ld\+json|application\/json)["']/i.test(attrs)) {
      const parsed = parseJsonSafe(body)
      if (parsed) roots.push(parsed)
      continue
    }
    const assignment = body.match(/(?:window\.)?[A-Za-z_$][\w$.[\]"']*\s*=\s*([{[])/)
    if (assignment?.index === undefined) continue
    const jsonStart = body.indexOf(assignment[1], assignment.index)
    const candidate = findBalancedJson(body, jsonStart)
    const parsed = candidate ? parseJsonSafe(candidate) : null
    if (parsed) roots.push(parsed)
  }
  return roots
}

function collectObjects(root: unknown, include: (object: JsonObject) => number | null) {
  const results: ScoredObject[] = []
  const queue: unknown[] = [root]
  const seen = new Set<object>()
  let visited = 0
  while (queue.length && visited < 6000) {
    const current = queue.shift()
    visited += 1
    if (!current || typeof current !== 'object') continue
    if (seen.has(current as object)) continue
    seen.add(current as object)
    if (Array.isArray(current)) {
      queue.push(...current.slice(0, 300))
      continue
    }
    const object = current as JsonObject
    const score = include(object)
    if (score !== null) results.push({ object, score })
    for (const child of Object.values(object)) if (child && typeof child === 'object') queue.push(child)
  }
  return results.sort((a, b) => b.score - a.score)
}

function collectProductObjects(root: unknown) {
  return collectObjects(root, (object) => {
    let score = 0
    for (const key of Object.keys(object)) if (PRODUCT_KEYS.has(normalizeKey(key))) score += 1
    return score > 0 ? score : null
  })
}

function collectJsonLdProductObjects(root: unknown) {
  const productRoots = collectObjects(root, (object) => {
    const values = Array.isArray(object['@type']) ? object['@type'] : [object['@type']]
    return values.some((value) => String(value || '').toLowerCase() === 'product') ? 100 : null
  })
  const result: ScoredObject[] = []
  for (const product of productRoots) {
    result.push(product)
    const descendants = collectObjects(product.object, (object) => object === product.object ? null : 90)
    result.push(...descendants)
  }
  return result.sort((a, b) => b.score - a.score)
}

function firstValue(objects: ScoredObject[], keys: string[]) {
  const wanted = new Set(keys.map(normalizeKey))
  for (const { object } of objects) {
    for (const [key, value] of Object.entries(object)) {
      if (wanted.has(normalizeKey(key)) && value !== null && value !== undefined && value !== '') return value
    }
  }
  return null
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => cleanString(typeof item === 'object' && item ? (item as any).name ?? (item as any).title ?? (item as any).value : item, 180))
    .filter((item): item is string => Boolean(item))
    .slice(0, 20)
}

function normalizeWeightKg(value: unknown) {
  const amount = positiveNumber(value)
  if (!amount) return null
  const text = cleanString(value, 120) || ''
  if (/\b(?:g|gram|grams)\b/i.test(text) && !/\bkg\b|kilogram/i.test(text)) return Number((amount / 1000).toFixed(6))
  if (/\b(?:lb|lbs|pound|pounds)\b/i.test(text)) return Number((amount * 0.45359237).toFixed(6))
  return amount
}

function dimensionsToCbm(value: unknown) {
  let text = cleanString(value, 220)
  if (!text && value && typeof value === 'object') {
    const object = value as any
    const length = positiveNumber(object.length ?? object.l)
    const width = positiveNumber(object.width ?? object.w)
    const height = positiveNumber(object.height ?? object.h)
    if (!length || !width || !height) return null
    text = `${length}x${width}x${height} ${cleanString(object.unit ?? object.units, 20) || 'cm'}`
  }
  if (!text) return null
  const dims = text.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) || []
  if (dims.length !== 3 || dims.some((n) => !Number.isFinite(n) || n <= 0)) return null
  const factor = /\bmm\b/i.test(text) ? 0.001 : /\b(?:m|meter|meters|metre|metres)\b/i.test(text) && !/\bcm\b/i.test(text) ? 1 : 0.01
  return Number((dims[0] * factor * dims[1] * factor * dims[2] * factor).toFixed(6))
}

function normalizeVolumeCbm(value: unknown) {
  const amount = positiveNumber(value)
  if (!amount) return null
  const text = cleanString(value, 140) || ''
  if (/\b(?:cm3|cm\^3|cubic centimet)/i.test(text)) return Number((amount / 1_000_000).toFixed(6))
  if (/\b(?:l|liter|liters|litre|litres)\b/i.test(text) && !/\bml\b/i.test(text)) return Number((amount / 1000).toFixed(6))
  return amount
}

function extractSpecs(html: string, objects: ScoredObject[]) {
  const specs: Array<{ name: string; value: string }> = []
  const dedupe = new Set<string>()
  const push = (nameValue: unknown, valueValue: unknown) => {
    const name = cleanString(nameValue, 100)
    const value = cleanString(valueValue, 260)
    if (!name || !value) return
    const id = `${normalizeSpecName(name)}=${value.toLowerCase()}`
    if (dedupe.has(id)) return
    dedupe.add(id)
    specs.push({ name, value })
  }

  for (const { object } of objects.slice(0, 160)) {
    for (const [key, value] of Object.entries(object)) {
      if (!['specifications', 'specification', 'specs', 'attributes', 'productattributes'].includes(normalizeKey(key))) continue
      if (Array.isArray(value)) {
        for (const item of value.slice(0, 80)) {
          if (!item || typeof item !== 'object') continue
          const spec = item as any
          push(spec.name ?? spec.attrName ?? spec.attributeName ?? spec.key ?? spec.label, spec.value ?? spec.attrValue ?? spec.attributeValue ?? spec.val ?? spec.text)
        }
      } else if (value && typeof value === 'object') {
        for (const [name, specValue] of Object.entries(value as JsonObject)) push(name, specValue)
      }
    }
  }

  if (!specs.length) {
    const text = visibleText(html)
    const pattern = /(Place of Origin|Country of Origin|Material|Movement Brand|Movement|Product Type|Type|Function)\s*[:：]\s*([^|;]{2,120})/gi
    for (const match of text.matchAll(pattern)) push(match[1], match[2])
  }
  return specs.slice(0, 80)
}

function specValue(specs: Array<{ name: string; value: string }>, names: string[]) {
  for (const name of names) {
    const wanted = normalizeSpecName(name)
    const match = specs.find((spec) => normalizeSpecName(spec.name) === wanted)
    if (match) return match.value
  }
  return null
}

function labelledNumber(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return positiveNumber(match[1])
  }
  return null
}

export function extractAlibabaDirectFacts(html: string, url?: URL): AlibabaDirectFacts {
  const roots = extractJsonRoots(html)
  const jsonLdObjects = roots.flatMap(collectJsonLdProductObjects)
  const productObjects = roots.flatMap(collectProductObjects)
  const allObjects = [...jsonLdObjects, ...productObjects]
  const specs = extractSpecs(html, allObjects)
  const evidence: string[] = []
  const text = visibleText(html)

  const nameValue = firstValue(allObjects, ['productTitle', 'product_title', 'subject', 'productName', 'product_name', 'name', 'title'])
  const metaTitle = metaValue(html, 'og:title') || metaValue(html, 'twitter:title')
  let name = cleanString(nameValue, 700) || metaTitle
  if (name && /^Alibaba\.com/i.test(name)) name = null
  if (name) evidence.push('title')

  const categoryPath = stringArray(firstValue(allObjects, ['categoryPath', 'category_path', 'breadcrumbs', 'breadcrumb']))
  const category = cleanString(firstValue(allObjects, ['categoryName', 'category_name', 'productCategory', 'product_category', 'category', 'productType', 'product_type']), 300)
    || categoryPath[categoryPath.length - 1]
    || specValue(specs, ['product type', 'type'])
  if (category || categoryPath.length) evidence.push('category')

  let unitPriceUsd = positiveNumber(firstValue(allObjects, ['priceValue', 'price_value', 'minPrice', 'min_price', 'lowPrice', 'salePrice', 'unitPrice', 'unit_price', 'price']))
  if (!unitPriceUsd) unitPriceUsd = positiveNumber(text.match(/(?:US\s*\$|USD\s*|\$)\s*(\d{1,7}(?:\.\d{1,4})?)/i)?.[1])
  if (unitPriceUsd) evidence.push('price')

  let moq = positiveNumber(firstValue(allObjects, ['moq', 'minimumOrderQuantity', 'minimum_order_quantity', 'minOrderQuantity', 'min_order_quantity', 'minOrder', 'min_order']))
  if (!moq) moq = labelledNumber(text, [/(?:MOQ|Minimum Order Quantity|Min\. Order)\s*[:：-]?\s*(\d{1,7})/i, /(\d{1,7})\s*(?:pieces|pcs|units|sets)\s*(?:minimum|min\. order)/i])
  if (moq) evidence.push('moq')

  const weightValue = firstValue(allObjects, ['unitWeight', 'unit_weight', 'packageWeight', 'package_weight', 'grossWeight', 'gross_weight', 'packingWeight', 'packing_weight', 'weight'])
  let packedWeightKg = normalizeWeightKg(weightValue)
  if (!packedWeightKg) {
    const match = text.match(/(?:Package Weight|Gross Weight|Unit Weight|Packing Weight)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(kg|g|grams?|lbs?|pounds?)/i)
    packedWeightKg = match ? normalizeWeightKg(`${match[1]} ${match[2]}`) : null
  }
  if (packedWeightKg) evidence.push('weight')

  const unitSizeValue = firstValue(allObjects, ['unitSize', 'unit_size', 'packageDimensions', 'package_dimensions', 'packageSize', 'package_size', 'packingSize', 'packing_size', 'dimensions'])
  const unitSize = cleanString(unitSizeValue, 220)
  const volumeValue = firstValue(allObjects, ['unitVolume', 'unit_volume', 'volumeCbm', 'volume_cbm', 'packageVolume', 'package_volume'])
  let volumeCbm = normalizeVolumeCbm(volumeValue) ?? dimensionsToCbm(unitSizeValue)
  if (!volumeCbm) {
    const sizeMatch = text.match(/(?:Package Size|Package Dimensions|Unit Size|Packing Size)\s*[:：]?\s*(\d+(?:\.\d+)?\s*[x×*]\s*\d+(?:\.\d+)?\s*[x×*]\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)?)/i)
    volumeCbm = sizeMatch ? dimensionsToCbm(sizeMatch[1]) : null
  }
  if (volumeCbm) evidence.push('volume')

  const originCountry = cleanString(firstValue(allObjects, ['countryOfOrigin', 'country_of_origin', 'originCountry', 'origin_country']), 120)
    || specValue(specs, ['place of origin', 'country of origin', 'origin', 'country region', 'country/region'])
  if (originCountry) evidence.push('origin')

  const material = specValue(specs, ['material', 'case material', 'main material'])
  const functionText = specValue(specs, ['product type']) || specValue(specs, ['function']) || specValue(specs, ['type']) || specValue(specs, ['movement'])
  if (material) evidence.push('material')
  if (functionText) evidence.push('function')

  const imageValue = firstValue(allObjects, ['imageUrl', 'image_url', 'mainImage', 'main_image', 'image'])
  const imageUrl = cleanString(Array.isArray(imageValue) ? imageValue[0] : imageValue, 1000) || metaValue(html, 'og:image')
  if (imageUrl) evidence.push('image')

  const supplier = cleanString(firstValue(allObjects, ['supplierName', 'supplier_name', 'companyName', 'company_name', 'supplier']), 300)
  if (supplier) evidence.push('supplier')

  const hsCode = cleanString(firstValue(allObjects, ['hsCode', 'hs_code', 'hscode', 'tariffCode', 'tariff_code']), 120)
  if (hsCode) evidence.push('hs')

  const productId = cleanString(firstValue(allObjects, ['productId', 'product_id', 'id']), 100)
    || url?.pathname.match(/_(\d{8,})\.html/i)?.[1]
    || null
  if (productId) evidence.push('product_id')

  const descriptionMeta = metaValue(html, 'og:description') || metaValue(html, 'description')
  const specsText = specs.length ? `Specifications: ${specs.slice(0, 18).map((spec) => `${spec.name}: ${spec.value}`).join('; ')}` : null
  const description = [descriptionMeta, categoryPath.length ? `Category path: ${categoryPath.join(' > ')}` : null, specsText]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 2400) || null

  return {
    name,
    category: category || null,
    categoryPath,
    unitPriceUsd,
    moq: moq ? Math.round(moq) : null,
    packedWeightKg,
    volumeCbm,
    unitSize,
    originCountry,
    imageUrl,
    supplier,
    description,
    material,
    functionText,
    hsCode,
    productId,
    specifications: specs,
    evidence: [...new Set(evidence)],
  }
}
