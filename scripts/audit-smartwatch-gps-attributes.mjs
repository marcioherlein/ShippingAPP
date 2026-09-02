const retailers = [
  ['Frávega', 'https://www.fravega.com'],
  ['Cetrogar', 'https://www.cetrogar.com.ar'],
  ['Naldo', 'https://www.naldo.com.ar'],
  ['OnCity', 'https://www.oncity.com'],
  ['Pardo', 'https://www.pardo.com.ar'],
]

const queries = ['smartwatch gps', 'reloj inteligente gps', 'smartwatch']

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d)\s*["”″]/g, '$1 inch ')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^a-z0-9.+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function productsOf(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value.products)) return value.products
  if (value.productSearch && Array.isArray(value.productSearch.products)) return value.productSearch.products
  if (value.data && Array.isArray(value.data.products)) return value.data.products
  return []
}

function attributesOf(product) {
  const rows = []
  const seen = new Set()
  const add = (name, values) => {
    const cleanName = String(name || '').trim().replace(/\s+/g, ' ')
    const cleanValues = Array.isArray(values)
      ? values.map((value) => String(value || '').trim().replace(/\s+/g, ' ')).filter(Boolean)
      : []
    if (!cleanName || !cleanValues.length) return
    const key = `${cleanName.toLowerCase()}=${cleanValues.join('|').toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push({ name: cleanName, value: cleanValues.join(', ') })
  }
  for (const property of product?.properties || []) add(property?.name, property?.values)
  for (const group of product?.specificationGroups || []) {
    for (const specification of group?.specifications || []) add(specification?.name, specification?.values)
  }
  if (product?.brand) add('Marca', [product.brand])
  if (product?.productReference) add('Modelo', [product.productReference])
  return rows.slice(0, 80)
}

function titleOf(product) {
  const base = String(product?.productName || '').trim().replace(/\s+/g, ' ')
  const itemNames = (product?.items || [])
    .flatMap((item) => [item?.nameComplete, item?.name])
    .map((value) => String(value || '').trim().replace(/\s+/g, ' '))
    .filter(Boolean)
  return [...new Set([base, ...itemNames].filter(Boolean))].join(' | ')
}

function priceOf(product) {
  for (const item of product?.items || []) {
    for (const seller of item?.sellers || []) {
      const offer = seller?.commertialOffer || seller?.commercialOffer || {}
      const price = Number(offer?.Price)
      const available = offer?.AvailableQuantity
      if (Number.isFinite(price) && price > 0 && !(typeof available === 'number' && available <= 0)) return price
    }
  }
  return null
}

function evidenceOf(product) {
  const attrs = attributesOf(product)
  return {
    attrs,
    text: normalize([titleOf(product), ...attrs.flatMap((row) => [row.name, row.value])].join(' ')),
  }
}

function hasGps(text) {
  return /\bgps\b/.test(text)
}

function inchValues(text) {
  const values = []
  for (const match of text.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:inch|inches|pulgada|pulgadas)\b/g)) {
    const amount = Number(match[1])
    if (Number.isFinite(amount)) values.push(amount)
  }
  return [...new Set(values)]
}

function millimeterValues(text) {
  const values = []
  for (const match of text.matchAll(/\b(\d+(?:\.\d+)?)\s*mm\b/g)) {
    const amount = Number(match[1])
    if (Number.isFinite(amount) && amount >= 20 && amount <= 80) values.push(amount)
  }
  return [...new Set(values)]
}

async function fetchJson(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6500)
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'ShippingAPP-smartwatch-attribute-audit/1.0' },
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, status: response.status, data: null }
    return { ok: true, status: response.status, data: await response.json() }
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

async function discover(retailer, baseUrl, query) {
  const params = new URLSearchParams({ query, count: '24', page: '1' })
  const intelligent = await fetchJson(`${baseUrl}/api/io/_v/api/intelligent-search/product_search/trade-policy/1?${params}`)
  if (intelligent.ok) {
    const products = productsOf(intelligent.data)
    if (products.length) return { retailer, mode: 'intelligent', status: intelligent.status, products }
  }
  const legacy = await fetchJson(`${baseUrl}/api/catalog_system/pub/products/search/${encodeURIComponent(query)}`)
  return {
    retailer,
    mode: legacy.ok ? 'legacy' : 'unavailable',
    status: legacy.status,
    products: legacy.ok ? productsOf(legacy.data) : [],
    error: legacy.error || intelligent.error || null,
  }
}

const rows = []
for (const query of queries) {
  const discoveries = await Promise.all(retailers.map(([retailer, baseUrl]) => discover(retailer, baseUrl, query)))
  for (const result of discoveries) {
    for (const product of result.products) {
      const priceArs = priceOf(product)
      if (!priceArs) continue
      const evidence = evidenceOf(product)
      if (!hasGps(evidence.text)) continue
      const inches = inchValues(evidence.text)
      const millimeters = millimeterValues(evidence.text)
      rows.push({
        query,
        retailer: result.retailer,
        mode: result.mode,
        productId: String(product?.productId || ''),
        title: titleOf(product),
        priceArs,
        gpsEvidence: true,
        inchValues: inches,
        mmValues: millimeters,
        exact14InchEvidence: inches.includes(1.4),
        nearby14InchEvidence: inches.some((value) => value >= 1.35 && value <= 1.45),
        attributes: evidence.attrs.filter((row) => /gps|pantalla|display|screen|pulg|inch|mm|tamano|tamaño|diametro|diámetro/i.test(`${row.name} ${row.value}`)).slice(0, 20),
      })
    }
  }
}

const deduped = [...new Map(rows.map((row) => [`${row.retailer}:${row.productId || row.title}`, row])).values()]
const exact14 = deduped.filter((row) => row.exact14InchEvidence)
const nearby14 = deduped.filter((row) => row.nearby14InchEvidence)
const noVisibleInch = deduped.filter((row) => row.inchValues.length === 0)

console.log(JSON.stringify({
  status: 'smartwatch_gps_attribute_audit',
  queries,
  gpsProducts: deduped.length,
  exact14InchProducts: exact14.length,
  nearby14InchProducts: nearby14.length,
  noVisibleInchProducts: noVisibleInch.length,
  exact14ByRetailer: Object.fromEntries(retailers.map(([name]) => [name, exact14.filter((row) => row.retailer === name).length])),
  exact14,
  nearby14: nearby14.filter((row) => !row.exact14InchEvidence),
  gpsProductsSample: deduped.slice(0, 30),
}, null, 2))
