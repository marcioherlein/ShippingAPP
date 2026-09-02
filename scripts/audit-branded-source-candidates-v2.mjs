const candidates = [
  { id: 'samsung-official', host: 'https://shop.samsung.com.ar', queries: ['samsung galaxy a16', 'samsung s24 fe'] },
  { id: 'motorola-official', host: 'https://tienda.motorola.com.ar', queries: ['motorola g15', 'motorola g85'] },
  { id: 'jbl-official', host: 'https://www.jbl.com.ar', queries: ['jbl go 4', 'jbl tune'] },
  { id: 'venex', host: 'https://www.venex.com.ar', queries: ['lenovo ideapad slim 3', 'epson l3250'] },
  { id: 'mexx', host: 'https://www.mexx.com.ar', queries: ['lenovo ideapad slim 3', 'epson l3250'] },
  { id: 'circuito-cell', host: 'https://circuitocell.com.ar', queries: ['iphone 16 128gb', 'samsung a16'] },
]

const timeoutMs = 6000

function productsOf(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value.products)) return value.products
  if (value.productSearch && Array.isArray(value.productSearch.products)) return value.productSearch.products
  if (value.data && Array.isArray(value.data.products)) return value.data.products
  return []
}

function priceCount(products) {
  let count = 0
  for (const product of products) {
    for (const item of product?.items || []) {
      for (const seller of item?.sellers || []) {
        const offer = seller?.commertialOffer || seller?.commercialOffer
        const price = Number(offer?.Price)
        const qty = offer?.AvailableQuantity
        if (price > 0 && !(typeof qty === 'number' && qty <= 0)) count += 1
      }
    }
  }
  return count
}

async function getJson(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'ShippingAPP structured-source audit/1.0' },
      redirect: 'follow',
      signal: controller.signal,
    })
    const contentType = response.headers.get('content-type') || ''
    let payload = null
    if (contentType.includes('json')) {
      try { payload = await response.json() } catch { payload = null }
    }
    const products = productsOf(payload)
    return {
      httpStatus: response.status,
      contentType,
      finalUrl: response.url,
      products: products.length,
      priced: priceCount(products),
      durationMs: Date.now() - started,
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started, products: 0, priced: 0 }
  } finally {
    clearTimeout(timer)
  }
}

async function probe(host, query) {
  const params = new URLSearchParams({ query, count: '12', page: '1' })
  const intelligentUrl = `${host}/api/io/_v/api/intelligent-search/product_search/trade-policy/1?${params}`
  const intelligent = await getJson(intelligentUrl)
  const legacy = intelligent.priced > 0
    ? null
    : await getJson(`${host}/api/catalog_system/pub/products/search/${encodeURIComponent(query)}`)
  return { query, intelligent, legacy, useful: Math.max(intelligent.priced || 0, legacy?.priced || 0) > 0 }
}

const rows = []
for (const candidate of candidates) {
  const probes = []
  for (const query of candidate.queries) probes.push(await probe(candidate.host, query))
  const usefulQueries = probes.filter((p) => p.useful).length
  const totalPriced = probes.reduce((sum, p) => sum + Math.max(p.intelligent.priced || 0, p.legacy?.priced || 0), 0)
  rows.push({ ...candidate, usefulQueries, totalPriced, probes })
}

const viable = rows.filter((row) => row.usefulQueries > 0 && row.totalPriced > 0)
console.log(JSON.stringify({
  status: 'branded_source_candidates_v2_complete',
  methodology: 'Only public structured VTEX-style endpoints were probed. No anti-bot bypass and no HTML scraping.',
  viable: viable.map(({ id, host, usefulQueries, totalPriced }) => ({ id, host, usefulQueries, totalPriced })),
  rows,
}, null, 2))
